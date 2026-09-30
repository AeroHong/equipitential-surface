import { useCallback, useEffect, useRef, useState } from 'react'
import { recordLeaveStart, recordLeaveEnd } from '../services/essay.js'
import {
  fullscreenSupported, currentFullscreenElement, requestAppFullscreen, exitAppFullscreen,
  isLeaveSuppressed, clearLeaveSuppression
} from '../utils/focusGuard.js'

const BLUR_GRACE_MS = 1500
// 돌아온 직후 이 시간 안에 오는 전체화면 해제는 방금 끝난 이탈의 여파로 본다(아래 handleFullscreenChange).
const RETURN_GRACE_MS = 3000

/**
 * 제한시간 평가 중 "입력 화면을 벗어났는지"를 감지해 기록하는 훅(pages/student/EssayWritePage.jsx).
 *
 * 이탈로 보는 경우:
 *   - hidden: 탭/앱 전환, 홈 화면(visibilitychange)
 *   - blur: 페이지는 보이지만 다른 창에 포커스가 1.5초 넘게 가 있음(분할화면·팝업 창). 페이지 안의
 *     iframe(지문의 유튜브 등)으로 포커스가 옮겨간 경우는 제외한다.
 *   - fullscreen_exit: 전체화면으로 시작했는데 풀림 — 페이지에 머물러 있어도 경고창을 바로 띄우고,
 *     학생이 "전체화면으로 돌아가기"를 눌러야 이탈이 끝난 것으로 본다.
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
  const countRef = useRef(0)
  const lastReturnAtRef = useRef(0)
  const warningPendingRef = useRef(false)
  const offsetRef = useRef(serverOffsetMs)
  offsetRef.current = serverOffsetMs
  const subIdRef = useRef(submissionId)
  subIdRef.current = submissionId

  const now = () => Date.now() + (offsetRef.current || 0)

  const startLeave = useCallback((type) => {
    if (leavingRef.current || suppressedLeaveRef.current) return
    if (isLeaveSuppressed()) {
      suppressedLeaveRef.current = true
      return
    }
    leavingRef.current = { type, leftAt: now() }
    countRef.current += 1
    setLeaveCount(countRef.current)
    if (subIdRef.current) recordLeaveStart(subIdRef.current, type).catch(err => console.error('이탈 기록 실패:', err))
    if (type === 'fullscreen_exit') setFullscreenLost(true)
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
    lastReturnAtRef.current = Date.now()
    const returnedAt = now()
    const durationMs = Math.max(0, returnedAt - leaving.leftAt)
    if (subIdRef.current) {
      recordLeaveEnd(subIdRef.current, { type: leaving.type, leftAt: leaving.leftAt, returnedAt, durationMs })
        .catch(err => console.error('이탈 기록 실패:', err))
    }
    if (showWarning) {
      warningPendingRef.current = true
      setWarning({ count: countRef.current, durationMs, type: leaving.type })
    }
  }, [])

  useEffect(() => {
    if (!enabled) return

    fsActiveRef.current = Boolean(currentFullscreenElement())

    function handleVisibility() {
      if (document.visibilityState === 'hidden') {
        startLeave('hidden')
      } else if (leavingRef.current?.type !== 'fullscreen_exit' || suppressedLeaveRef.current) {
        // 안드로이드는 홈으로 나가면 전체화면도 함께 풀린다 — 그 경우 이탈 유형은 hidden으로
        // 이미 기록돼 있으니, 돌아오면 경고창에서 전체화면 복귀까지 함께 처리한다.
        endLeave({ showWarning: true })
        if (fsActiveRef.current && !currentFullscreenElement()) setFullscreenLost(true)
      }
    }

    function handleBlur() {
      clearTimeout(blurTimerRef.current)
      blurTimerRef.current = setTimeout(() => {
        if (document.visibilityState === 'hidden') return // visibilitychange가 처리
        if (document.hasFocus()) return
        // 페이지 안의 iframe(유튜브 지문 등)을 누른 경우 — 이탈이 아니다.
        if (document.activeElement?.tagName === 'IFRAME') return
        startLeave('blur')
      }, BLUR_GRACE_MS)
    }

    function handleFocus() {
      clearTimeout(blurTimerRef.current)
      // PC에서 사진 첨부 창은 hidden이 아니라 blur로만 이탈을 만든다 — 창을 닫고 돌아왔을 때
      // 무시 상태도 여기서 풀어야 한다(안 그러면 그 뒤의 이탈이 전부 무시된다).
      if (leavingRef.current?.type === 'blur' || suppressedLeaveRef.current) endLeave({ showWarning: true })
    }

    function handleFullscreenChange() {
      const active = Boolean(currentFullscreenElement())
      if (active) {
        fsActiveRef.current = true
        setFullscreenLost(false)
        if (leavingRef.current?.type === 'fullscreen_exit') endLeave({ showWarning: false })
        return
      }
      if (!fsActiveRef.current) return
      // 탭 전환으로 인한 해제는 hidden 쪽에서 처리한다.
      if (document.visibilityState === 'hidden') return
      // 브라우저는 탭/앱이 숨겨진 동안 전체화면 해제 이벤트를 미뤄뒀다가 "돌아와서 화면이 보일 때"
      // 보낸다 — 이미 센 이탈(나갈 때 1회)을 돌아올 때 또 세지 않도록, 이탈 중이거나 경고창이
      // 떠 있거나 막 돌아온 직후라면 새 이탈로 세지 않고 전체화면 복귀만 요구한다(실사용 신고).
      if (leavingRef.current || warningPendingRef.current || Date.now() - lastReturnAtRef.current < RETURN_GRACE_MS) {
        setFullscreenLost(true)
        return
      }
      startLeave('fullscreen_exit')
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('blur', handleBlur)
    window.addEventListener('focus', handleFocus)
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
    return () => {
      clearTimeout(blurTimerRef.current)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('blur', handleBlur)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
    }
  }, [enabled, startLeave, endLeave])

  // 제출·마감으로 감지가 꺼지면 경고창을 치우고 전체화면도 풀어준다.
  useEffect(() => {
    if (enabled) return
    leavingRef.current = null
    warningPendingRef.current = false
    setWarning(null)
    setFullscreenLost(false)
    setUsingFullscreen(false)
    if (fsActiveRef.current) {
      fsActiveRef.current = false
      exitAppFullscreen()
    }
  }, [enabled])

  /** 시작 게이트·경고창 버튼에서(클릭 제스처 안에서) 호출. */
  const enterFullscreen = useCallback(async () => {
    if (!fullscreenSupported()) return false
    const ok = await requestAppFullscreen()
    if (ok) {
      fsActiveRef.current = true
      setUsingFullscreen(true)
    }
    return ok
  }, [])

  const acknowledge = useCallback(async () => {
    warningPendingRef.current = false
    setWarning(null)
    if (fsActiveRef.current && !currentFullscreenElement()) {
      const ok = await requestAppFullscreen()
      if (!ok) {
        // 다시 들어가지 못하는 기기면 전체화면 없이 계속하게 둔다(이탈 자체는 이미 기록됨).
        fsActiveRef.current = false
        setUsingFullscreen(false)
        if (leavingRef.current?.type === 'fullscreen_exit') endLeave({ showWarning: false })
        setFullscreenLost(false)
      }
    }
  }, [endLeave])

  return {
    leaveCount,
    warning,
    fullscreenLost,
    usingFullscreen,
    blocking: Boolean(warning) || fullscreenLost,
    enterFullscreen,
    acknowledge
  }
}
