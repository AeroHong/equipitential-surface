import React, { useEffect, useId, useRef, useState } from 'react'

const DEPLOY_SCRIPT_URL = 'https://www.geogebra.org/apps/deployggb.js'

// deployggb.js는 앱 전체에서 한 번만 로드하면 된다 — 데스크톱 상시 패널과 모바일
// 바텀시트 양쪽에서 이 컴포넌트가 동시에 쓰일 수 있어, 모듈 스코프에 프라미스를 캐싱해
// 중복 <script> 삽입/중복 로드를 막는다.
let scriptPromise = null
function loadDeployScript() {
  if (window.GGBApplet) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = DEPLOY_SCRIPT_URL
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => { scriptPromise = null; reject(new Error('GeoGebra 스크립트 로드 실패')) }
    document.head.appendChild(script)
  })
  return scriptPromise
}

/**
 * GeoGebra 공식 Scientific Calculator 앱을 임베드하는 패널. 물리학 서술형 모드
 * (assignment.responseType === 'essay_calculator')에서 EssayWritePage.jsx가 데스크톱 상시 패널과
 * 모바일 바텀시트 양쪽에 이 컴포넌트를 그대로 재사용한다. 계산 로직은 GeoGebra 공식 앱을
 * 그대로 쓰므로 직접 구현/검증할 필요가 없다. API 키가 필요 없는 무료 공개 임베드.
 *
 * 리사이즈 관련 중요 사실(실제로 배포해서 여러 번 테스트해서 확인함):
 * - `scaleContainerClass`는 컨테이너 크기를 자동으로 따라가는 기능이 아니다 — GGBApplet에
 *   넘긴 width/height 파라미터가 실제 렌더 크기를 그대로 결정한다(처음엔 "컨테이너 크기에
 *   맞춰 자동 스케일된다"고 착각했는데, 그때마다 우연히 width/height 파라미터를 컨테이너
 *   크기와 똑같이 맞춰놨던 것뿐이었다).
 * - `applet.setSize(w, h)`로 나중에 강제로 다시 맞추는 것도 시도해봤지만, 전역 참조가
 *   불안정하고(getAppletObject()로 얻은 참조는 반영 안 됨, id 파라미터를 컨테이너 DOM id와
 *   같게 주면 브라우저의 named-access가 가로채 버림) 반영되더라도 키패드 레이아웃이
 *   깨지는 경우가 있어 신뢰할 수 없었다.
 * - 그래서 "실시간 리사이즈"는 하지 않는다. 대신 마운트되는 시점에 컨테이너의 실제 크기를
 *   재서 width/height 파라미터로 그대로 넘긴다. 리마운트 직후엔(드래그 종료 → key 변경)
 *   레이아웃이 아직 끝나기 전에 useEffect가 먼저 실행돼 getBoundingClientRect()가 0을
 *   돌려주는 경우가 실제로 있었다(0이면 무조건 기본값 320×480으로 폴백해버려서, 드래그로
 *   넓혀도 계속 처음 크기로만 주입되는 버그로 이어졌음) — 그래서 한 번 재고 끝내지 않고
 *   ResizeObserver로 "실제로 0보다 큰 크기가 잡힐 때"까지 기다렸다가 그 크기로 주입한다.
 *   실시간으로 크기가 늘어나 보이게 하려면 EssayWritePage.jsx가 드래그가 끝난 시점에 이
 *   컴포넌트를 다른 key로 새로 마운트해서 이 경로를 다시 타게 한다.
 */
export default function CalculatorPanel() {
  const rawId = useId().replace(/[^a-zA-Z0-9]/g, '')
  const containerId = `ggb-calc-${rawId}`
  const containerRef = useRef(null)
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'

  useEffect(() => {
    let cancelled = false
    let injected = false
    let resizeObserver = null

    function tryInject(width, height) {
      if (injected || cancelled || !containerRef.current) return
      injected = true
      const applet = new window.GGBApplet({
        appName: 'scientific',
        width: Math.round(width) || 320,
        height: Math.round(height) || 480,
        showMenuBar: false,
        showToolBar: false,
        // scientific 앱에서는 이게 입력창 하나를 숨기는 옵션이 아니라 계산기 UI(키패드) 전체를
        // 그리는 뷰라서, false로 두면 빈 화면만 나온다(실제로 겪은 버그 — 겉보기엔 정상
        // 주입/렌더 로그가 찍히는데 화면엔 아무것도 안 보였음). 반드시 true로 둘 것.
        showAlgebraInput: true,
        showResetIcon: false,
        language: 'ko',
        borderColor: '#e5e7eb'
      }, true)
      applet.inject(containerId)
      // inject()가 반환된다고 화면에 바로 그려지는 게 아니다 — 내부 앱(GWT) 부팅에 몇 초가
      // 더 걸린다. appletOnLoad 콜백은 신뢰성 있게 발화하지 않아(실제로 확인함) 못 쓰고,
      // 대신 스피너를 일정 시간 더 붙잡아둔다 — 정확하진 않지만 "저장됐다고 나왔는데
      // 화면엔 아무것도 없는" 빈 화면 구간을 없애준다.
      setTimeout(() => { if (!cancelled) setStatus('ready') }, 2500)
    }

    loadDeployScript()
      .then(() => {
        if (cancelled || !containerRef.current) return
        resizeObserver = new ResizeObserver(entries => {
          const entry = entries[0]
          if (!entry) return
          const { width, height } = entry.contentRect
          if (width > 0 && height > 0) tryInject(width, height)
        })
        resizeObserver.observe(containerRef.current)
        // ResizeObserver 콜백은 보통 observe() 직후 바로 한 번 발화하지만, 탭이 백그라운드로
        // 밀려있는 등 브라우저가 레이아웃/페인트 타이밍을 미루는 상황에서는 지연될 수 있다.
        // 그런 경우에도 "로딩중" 상태로 무한정 멈춰있지 않도록, 잠깐 기다렸다가 그래도 아직
        // 안 됐으면 그 시점의 실측 크기(또는 폴백 기본값)로 강제 주입한다.
        setTimeout(() => {
          if (!injected && !cancelled && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect()
            tryInject(rect.width, rect.height)
          }
        }, 400)
      })
      .catch(err => {
        console.error('GeoGebra 계산기 로드 실패:', err)
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
      resizeObserver?.disconnect()
      // GGBApplet에는 공식 destroy API가 없어, 컨테이너를 비우는 방식으로 정리한다.
      if (containerRef.current) containerRef.current.innerHTML = ''
    }
  }, [containerId])

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <div className="relative min-h-0 flex-1">
        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-gray-400">
            계산기를 불러오지 못했습니다. 네트워크 연결을 확인해주세요.
          </div>
        )}
        <div id={containerId} ref={containerRef} className="h-full w-full" />
      </div>
      <p className="flex-shrink-0 border-t border-gray-100 px-2 py-1 text-center text-[10px] text-gray-300">
        <a href="https://www.geogebra.org" target="_blank" rel="noreferrer" className="hover:underline">Powered by GeoGebra</a>
      </p>
    </div>
  )
}
