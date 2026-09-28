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
// GeoGebra는 넘긴 width/height보다 살짝 크게 그린다 — 특히 키패드를 ×로 닫은 뒤 나타나는
// "키패드 다시 열기" 아이콘(35px)은 지정 높이보다 약 17px 아래까지 삐져나와(실측), 바깥
// overflow-hidden에 잘려 안 보이게 되는 문제가 실제로 있었다(닫으면 다시 못 여는 것처럼
// 보임). 그만큼 여유를 두고 주입한다.
const WIDTH_SAFETY_MARGIN = 4
const HEIGHT_SAFETY_MARGIN = 28

export default function CalculatorPanel() {
  // "다시 불러오기" 버튼이 이 값을 올려 GeoGebra를 새로 주입한다 — 화면이 꼬였을 때 학생
  // 스스로 복구할 수 있는 마지막 수단(계산 기록은 초기화됨).
  const [reloadKey, setReloadKey] = useState(0)
  const rawId = useId().replace(/[^a-zA-Z0-9]/g, '')
  const containerId = `ggb-calc-${rawId}`
  const containerRef = useRef(null)
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'

  useEffect(() => {
    let cancelled = false
    let injected = false
    let resizeObserver = null
    let keyboardObserver = null

    // GeoGebra는 키패드 버튼을 누를 때마다 내부 숨김 textarea에 포커스를 줘서, 태블릿에서는
    // OS 가상 키보드가 매번 올라와 화면을 가려버린다. inputmode="none"은 포커스·입력(물리
    // 키보드 포함)은 그대로 두고 가상 키보드만 억제한다. GeoGebra가 입력 요소를 부팅 후에
    // 또는 키패드 재열기 때 새로 만들기 때문에, 한 번 붙이고 끝내지 않고 계속 감시한다.
    function suppressVirtualKeyboard() {
      const root = containerRef.current
      if (!root) return
      root.querySelectorAll('textarea, input, [contenteditable="true"]').forEach(el => {
        if (el.getAttribute('inputmode') !== 'none') el.setAttribute('inputmode', 'none')
      })
    }

    function tryInject(width, height) {
      if (injected || cancelled || !containerRef.current) return
      injected = true
      const applet = new window.GGBApplet({
        appName: 'scientific',
        width: Math.round(width - WIDTH_SAFETY_MARGIN) || 320,
        height: Math.round(height - HEIGHT_SAFETY_MARGIN) || 480,
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
      keyboardObserver = new MutationObserver(suppressVirtualKeyboard)
      keyboardObserver.observe(containerRef.current, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['inputmode']
      })
      suppressVirtualKeyboard()
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
      keyboardObserver?.disconnect()
      // GGBApplet에는 공식 destroy API가 없어, 컨테이너를 비우는 방식으로 정리한다.
      if (containerRef.current) containerRef.current.innerHTML = ''
    }
  }, [containerId, reloadKey])

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
        <div key={reloadKey} id={containerId} ref={containerRef} className="h-full w-full" />
      </div>
      <div className="flex flex-shrink-0 items-center justify-between border-t border-gray-100 px-2 py-1 text-[10px] text-gray-300">
        <a href="https://www.geogebra.org" target="_blank" rel="noreferrer" className="hover:underline">Powered by GeoGebra</a>
        <button
          type="button"
          onClick={() => {
            if (!window.confirm('계산기를 다시 불러올까요? 지금까지의 계산 기록은 지워집니다.')) return
            setStatus('loading')
            setReloadKey(k => k + 1)
          }}
          className="rounded px-1.5 py-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          ↻ 계산기 다시 불러오기
        </button>
      </div>
    </div>
  )
}
