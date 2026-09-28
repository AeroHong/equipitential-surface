// 제한시간(assignment.timeLimitMinutes) 계산 — 학생 작성 화면(자동 제출)과 교사 대시보드(남은
// 시간 표시)가 같은 규칙을 쓰도록 한곳에 둔다.

function toMillis(ts) {
  if (!ts) return null
  if (typeof ts.toMillis === 'function') return ts.toMillis()
  if (ts instanceof Date) return ts.getTime()
  return null
}

/**
 * 이 학생의 제한시간 종료 시각(ms, 서버 시계 기준). 제한시간이 없거나 아직 시작 전이면 null.
 * - 대기실을 쓰는 배정: 교사가 "평가 시작"을 누른 시각(examStartedAt)부터 — 모두 같은 시각에 끝난다.
 * - 대기실이 없는 배정: 학생이 처음 들어와 제출물이 만들어진 시각(submission.startedAt)부터.
 * @param {object} assignment
 * @param {object|null} submission
 * @param {number|null} [fallbackStartMs] 방금 만든 제출물은 startedAt이 아직 serverTimestamp()
 *   센티널이라 값을 못 읽는다 — 그때 대신 쓸 시작 시각.
 * @returns {number|null}
 */
export function getExamDeadlineMs(assignment, submission, fallbackStartMs = null) {
  const minutes = Number(assignment?.timeLimitMinutes)
  if (!minutes || minutes <= 0) return null
  const startMs = assignment.waitingRoomEnabled
    ? toMillis(assignment.examStartedAt)
    : (toMillis(submission?.startedAt) ?? fallbackStartMs)
  if (startMs == null) return null
  return startMs + minutes * 60 * 1000
}

/** 남은 시간(ms)을 "MM:SS" 또는 "H:MM:SS"로 */
export function formatRemaining(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}
