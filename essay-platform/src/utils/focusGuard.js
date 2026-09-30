// 화면 이탈 감지(hooks/useFocusGuard.js)에서 쓰는 순수 함수·전역 상태.
//
// 웹페이지는 브라우저 보안상 다른 탭을 닫거나 열린 탭을 볼 수 없다 — 그래서 "막기"는 전체화면
// (+ 태블릿의 화면 고정/사용법 유도 안내)으로, "잡기"는 이 모듈과 훅의 이탈 감지로 한다.

/** 사용자 결정: 이탈 감지는 제한시간이 있는 평가에서만 켠다(기본 on, 배정에서 끌 수 있음). */
export function isFocusGuardActive(assignment) {
  return Boolean(assignment?.timeLimitMinutes > 0) && assignment?.focusGuardEnabled !== false
}

/** 아이패드·아이폰 — 요즘 아이패드 Safari는 맥처럼 보이므로 터치 지점 수로 가려낸다. */
export function isAppleTouchDevice() {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function fullscreenSupported() {
  if (typeof document === 'undefined') return false
  // 아이패드 Safari는 전체화면 중 키보드 입력·확대/축소를 하면 전체화면을 스스로 풀어버려서
  // 작성 자체가 방해된다(실사용 신고) — 아예 전체화면을 쓰지 않는다.
  if (isAppleTouchDevice()) return false
  return Boolean(document.fullscreenEnabled || document.webkitFullscreenEnabled)
}

export function currentFullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null
}

/** 사용자 제스처(클릭) 안에서 불러야 한다. 실패해도(아이패드 등) 조용히 false. */
export async function requestAppFullscreen() {
  const el = document.documentElement
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' })
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen()
    else return false
    return true
  } catch {
    return false
  }
}

export function exitAppFullscreen() {
  if (!currentFullscreenElement()) return
  try {
    if (document.exitFullscreen) document.exitFullscreen().catch(() => {})
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen()
  } catch { /* 무시 */ }
}

/** 'fullscreen' | 'standalone'(설치한 앱) | 'browser' */
export function detectDisplayMode() {
  if (currentFullscreenElement()) return 'fullscreen'
  const mm = (q) => typeof window !== 'undefined' && window.matchMedia?.(q).matches
  if (mm('(display-mode: fullscreen)')) return 'fullscreen'
  if (mm('(display-mode: standalone)') || window.navigator?.standalone) return 'standalone'
  return 'browser'
}

// 앱이 스스로 여는 창(이미지 첨부용 파일 선택기 등)은 태블릿에서 탭이 hidden으로 바뀌어
// 이탈로 오인된다 — 그런 동작 직전에 suppressNextLeave()를 불러 다음 한 번의 이탈을 무시한다.
// 화면으로 돌아오면(또는 시간이 지나면) 자동으로 풀린다.
let suppressUntil = 0

export function suppressNextLeave(ms = 60000) {
  suppressUntil = Date.now() + ms
}

export function isLeaveSuppressed() {
  return Date.now() < suppressUntil
}

export function clearLeaveSuppression() {
  suppressUntil = 0
}

export const LEAVE_TYPE_LABELS = {
  hidden: '다른 탭·앱으로 전환',
  blur: '다른 창 선택(분할화면 등)',
  fullscreen_exit: '전체화면 해제'
}

export const DISPLAY_MODE_LABELS = {
  fullscreen: '전체화면',
  standalone: '설치한 앱',
  browser: '일반 브라우저'
}

export function formatDuration(ms) {
  const sec = Math.max(0, Math.round((ms || 0) / 1000))
  if (sec < 60) return `${sec}초`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s ? `${m}분 ${s}초` : `${m}분`
}
