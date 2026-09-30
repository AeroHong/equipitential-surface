import { useCallback, useEffect, useRef, useState } from 'react'
import { recordLeaveStart, recordLeaveEnd } from '../services/essay.js'
import {
  fullscreenSupported, currentFullscreenElement, requestAppFullscreen, exitAppFullscreen,
  isLeaveSuppressed, clearLeaveSuppression
} from '../utils/focusGuard.js'

// 이 시간보다 짧게 화면이 가려진 건 세지 않는다(알림 센터를 살짝 내렸다 올리는 등).
const HIDDEN_GRACE_MS = 2000
// 아이패드는 확대·축소나 키보드 입력 중에도 포커스를 잃었다는 blur가 오는 일이 잦았다(실사용 신고).
// 그래서 넉넉히 기다리고, 그동안 이 페이지에서 터치·입력이 있으면 이탈이 아닌 것으로 본다.
const BLUR_GRACE_MS = 5000
const ACTIVITY_EVENTS = ['keydown', 'input', 'pointerdown', 'touchstart']

/**
 * 제한시간 평가 중 "입력 화면을 벗어났는지"를 감지해 기록하는 훅(pages/student/EssayWritePage.jsx).
 *
 * 이탈로 보는 경우:
 *   - hidden: 탭/앱 전환, 홈 화면(visibilitychange)이 2초 넘게 이어짐
 *   - blur: 페이지는 보이지만 다른 창에 포커스가 5초 넘게 가 있고, 그동안 이 페이지에서 아무 입력도
 *     없음(분할화면·팝업 창). 페이지 안의 iframe(지문의 유튜브 등)으로 포커스가 옮겨간 경우는 제외.
 *
 * 전체화면 해제는 이탈로 세지 않는다 — 아이패드 확대·축소, 키보드 등으로 저절로 풀리는 일이 많아
 * 과하다는 사용자 판단. 풀리면 화면 아래에 "전체화면으로 돌아가기" 안내만 띄운다(fullscreenLost).
 *
 * 이탈 순간 제출물의 leaveCount를 올려(교사 대시보드 실시간 알림) 두고, 돌아왔을 때 지속시간을
 * focusEvents 서브컬렉션에 남긴 뒤 경고창(warning)을 띄운다.
 *
 * @param {{enabled: boolean, submissionId?: string, serverOffsetMs: number}} params
 */
export function useFocusGuard({ enabled, submissionId, serverOffsetMs }) {
  const [leaveCount, setLeaveCount] = useState(0)
  const [warning, setWarning] = useState(null) // {count, durationMs, type}
  const [fullscreenLost, setFullscreenLost] = useState(false)
  const [usingFullscreen, setUsingFullscreen] = useState(false) // 전체화면으로 시작했는지(버튼 문구용)
  const leavingRef = useRef(null) // {type, leftAt}
  const suppressedLeaveRef = useRef(false)
  const fsActiveRef = useRef(false)
  const blurTimerRef = useRef(null)
  const hiddenRef = useRef(null) // {leftAt, timer} — 가려졌지만 아직 이탈로 세기 전
  const countRef = useRef(0)
  const offsetRef = useRef(serverOffsetMs)
  offsetRef.current = serverOffsetMs
  const subIdRef = useRef(submissionId)
  subIdRef.current = submissionId

  const now = () => Date.now() + (offsetRef.current || 0)

  const startLeave = useCallback((type, leftAt) => {
    if (leavingRef.current || suppressedLeaveRef.current) return
    leavingRef.current = { type, leftAt: leftAt ?? now() }
    countRef.current += 1
    setLeaveCount(countRef.current)
    if (subIdRef.current) recordLeaveStart(subIdRef.current, type).catch(err => console.error('이탈 기록 실패:', err))
  }, [])

  const endLeave = useCallback(({ showWarning }) => {
    if (suppressedLeaveRef.current) {
      suppressedLeaveRef.current = false
      clearLeaveSuppression()
      return
    }
    const leaving = leavingRef.current
    if (!leaving) return
    leavingRef.current = null
    const returnedAt = now()
    const durationMs = Math.max(0, returnedAt - leaving.leftAt)
    if (subIdRef.current) {
      recordLeaveEnd(subIdRef.current, { type: leaving.type, leftAt: leaving.leftAt, returnedAt, durationMs })
        .catch(err => console.error('이탈 기록 실패:', err))
    }
    if (showWarning) setWarning({ count: countRef.current, durationMs, type: leaving.type })
  }, [])

  useEffect(() => {
    if (!enabled) return

    fsActiveRef.current = Boolean(currentFullscreenElement())

    function handleVisibility() {
      if (document.visibilityState === 'hidden') {
        clearTimeout(blurTimerRef.current)
        if (leavingRef.current || suppressedLeaveRef.current || hiddenRef.current) return
        // 앱이 스스로 연 창(사진 선택기 등) — 이번 한 번은 무시.
        if (isLeaveSuppressed()) {
          suppressedLeaveRef.current = true
          return
        }
        const leftAt = now()
        // 숨겨진 동안엔 타이머가 늦게 돌거나(스로틀) 아예 멈출 수 있다 — 그래도 돌아왔을 때 아래에서
        // 가려져 있던 시간으로 다시 판정하므로 빠지지 않는다. 타이머는 교사 실시간 알림용.
        const timer = setTimeout(() => {
          if (document.visibilityState === 'hidden' && hiddenRef.current) startLeave('hidden', leftAt)
        }, HIDDEN_GRACE_MS)
        hiddenRef.current = { leftAt, timer }
        return
      }

      const hidden = hiddenRef.current
      hiddenRef.current = null
      if (hidden) clearTimeout(hidden.timer)
      if (suppressedLeaveRef.current) {
        endLeave({ showWarning: false })
      } else if (leavingRef.current) {
        endLeave({ showWarning: true })
      } else if (hidden && now() - hidden.leftAt >= HIDDEN_GRACE_MS) {
        startLeave('hidden', hidden.leftAt)
        endLeave({ showWarning: true })
      }
      // 안드로이드는 홈으로 나가면 전체화면도 함께 풀린다.
      if (fsActiveRef.current && !currentFullscreenElement()) setFullscreenLost(true)
    }

    function handleBlur() {
      clearTimeout(blurTimerRef.current)
      const blurAt = now()
      blurTimerRef.current = setTimeout(() => {
        if (document.visibilityState === 'hidden') return // visibilitychange가 처리
        if (document.hasFocus()) return
        // 페이지 안의 iframe(유튜브 지문 등)을 누른 경우 — 이탈이 아니다.
        if (document.activeElement?.tagName === 'IFRAME') return
        if (isLeaveSuppressed()) {
          suppressedLeaveRef.current = true
          return
        }
        startLeave('blur', blurAt)
      }, BLUR_GRACE_MS)
    }

    function handleFocus() {
      clearTimeout(blurTimerRef.current)
      // PC에서 사진 첨부 창은 hidden이 아니라 blur로만 이탈을 만든다 — 창을 닫고 돌아왔을 때
      // 무시 상태도 여기서 풀어야 한다(안 그러면 그 뒤의 이탈이 전부 무시된다).
      if (suppressedLeaveRef.current) endLeave({ showWarning: false })
      else if (leavingRef.current?.type === 'blur') endLeave({ showWarning: true })
    }

    // 이 페이지에서 터치·키 입력이 일어나면 학생은 여기 있다 — 대기 중인 blur 판정을 취소하고,
    // 아이패드처럼 돌아와도 focus 이벤트가 안 오는 경우엔 여기서 blur 이탈을 끝낸다.
    function handleActivity() {
      clearTimeout(blurTimerRef.current)
      if (leavingRef.current?.type === 'blur') endLeave({ showWarning: true })
    }

    function handleFullscreenChange() {
      const active = Boolean(currentFullscreenElement())
      if (active) {
        fsActiveRef.current = true
        setFullscreenLost(false)
      } else if (fsActiveRef.current) {
        setFullscreenLost(true)
      }
    }

    const vv = window.visualViewport
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('blur', handleBlur)
    window.addEventListener('focus', handleFocus)
    for (const type of ACTIVITY_EVENTS) document.addEventListener(type, handleActivity, { capture: true, passive: true })
    vv?.addEventListener('resize', handleActivity) // 핀치 확대·축소
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
    return () => {
      clearTimeout(blurTimerRef.current)
      if (hiddenRef.current) clearTimeout(hiddenRef.current.timer)
      hiddenRef.current = null
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('blur', handleBlur)
      window.removeEventListener('focus', handleFocus)
      for (const type of ACTIVITY_EVENTS) document.removeEventListener(type, handleActivity, { capture: true })
      vv?.removeEventListener('resize', handleActivity)
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
    }
  }, [enabled, startLeave, endLeave])

  // 제출·마감으로 감지가 꺼지면 경고창을 치우고 전체화면도 풀어준다.
  useEffect(() => {
    if (enabled) return
    leavingRef.current = null
    setWarning(null)
    setFullscreenLost(false)
    setUsingFullscreen(false)
    if (fsActiveRef.current) {
      fsActiveRef.current = false
      exitAppFullscreen()
    }
  }, [enabled])

  /** 시작 게이트 버튼에서(클릭 제스처 안에서) 호출. */
  const enterFullscreen = useCallback(async () => {
    if (!fullscreenSupported()) return false
    const ok = await requestAppFullscreen()
    if (ok) {
      fsActiveRef.current = true
      setUsingFullscreen(true)
    }
    return ok
  }, [])

  /** 풀린 전체화면으로 다시 — 안 되는 기기면 더 묻지 않고 전체화면 없이 계속한다. */
  const returnToFullscreen = useCallback(async () => {
    if (!fsActiveRef.current || currentFullscreenElement()) {
      setFullscreenLost(false)
      return
    }
    const ok = await requestAppFullscreen()
    if (!ok) {
      fsActiveRef.current = false
      setUsingFullscreen(false)
    }
    setFullscreenLost(false)
  }, [])

  /** 전체화면 복귀 안내를 닫고 그냥 계속 작성한다(다시 풀려도 안내하지 않음). */
  const dismissFullscreenPrompt = useCallback(() => {
    fsActiveRef.current = false
    setUsingFullscreen(false)
    setFullscreenLost(false)
  }, [])

  const acknowledge = useCallback(async () => {
    setWarning(null)
    if (fsActiveRef.current && !currentFullscreenElement()) await returnToFullscreen()
  }, [returnToFullscreen])

  return {
    leaveCount,
    warning,
    fullscreenLost,
    usingFullscreen,
    blocking: Boolean(warning),
    enterFullscreen,
    returnToFullscreen,
    dismissFullscreenPrompt,
    acknowledge
  }
}
