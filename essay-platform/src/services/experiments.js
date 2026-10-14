import { collection, doc, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase.js'

// ─── 실험 결과(experimentResults) ────────────────────────────────
//
// 외부 분석 앱(현재는 Motion Tracker)이 학생 대신 써 넣는 컬렉션이다. 이 앱은 읽기만 한다 —
// 쓰기는 motion-tracking/public/js/essayBridge.js가 하고, 잠금 조건(보고서 제출·배정 마감)은
// firestore.rules의 validExperimentWrite가 강제한다. 문서 ID는 제출물과 같은 {aid}__{uid}.

export const MOTION_TRACKER_URL = 'https://motion-tracking.web.app/'

/** 배정에 연결할 수 있는 실험 도구·모드 — AssignmentEditor 선택지와 학생 카드 문구에 함께 쓴다. */
export const EXPERIMENT_MODES = {
  free: { label: '자유 물체 운동 (포물선 운동)' }
}

/**
 * 학생을 Motion Tracker로 보내는 링크. return은 작성 화면으로 돌아올 주소 —
 * Motion Tracker는 이 앱 origin으로 시작하는 주소만 받아준다(오픈 리다이렉트 방지).
 */
export function buildExperimentUrl(assignmentId, experiment) {
  const params = new URLSearchParams({
    assignment: assignmentId,
    mode: experiment?.mode || 'free',
    return: `${window.location.origin}/write/${assignmentId}`
  })
  return `${MOTION_TRACKER_URL}?${params}`
}

/**
 * 배정별 실험 결과 실시간 구독 (교사 대시보드용) — {studentUid: result}
 * @param {string} assignmentId
 * @param {function(Record<string, object>): void} callback
 * @param {string} [teacherUid] teacher는 반드시 넘겨야 한다(subscribeSubmissions와 같은 이유)
 * @returns {function} unsubscribe
 */
export function subscribeExperimentResults(assignmentId, callback, teacherUid) {
  const clauses = [where('assignmentId', '==', assignmentId)]
  if (teacherUid) clauses.push(where('teacherUid', '==', teacherUid))
  const q = query(collection(db, 'experimentResults'), ...clauses)
  return onSnapshot(q, (snap) => {
    callback(Object.fromEntries(snap.docs.map(d => [d.data().studentUid, { id: d.id, ...d.data() }])))
  }, (err) => {
    console.error('실험 결과 구독 실패:', err)
    callback({})
  })
}

/**
 * 한 학생의 실험 결과 실시간 구독 — 학생이 Motion Tracker에서 제출하고 돌아오면
 * 새로고침 없이 카드가 채워진다. ReplayView에서도 쓴다.
 * @param {string} assignmentId
 * @param {string} studentUid
 * @param {function(object|null): void} callback
 * @returns {function} unsubscribe
 */
export function subscribeExperimentResult(assignmentId, studentUid, callback) {
  return onSnapshot(doc(db, 'experimentResults', `${assignmentId}__${studentUid}`), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null)
  }, (err) => {
    console.error('실험 결과 구독 실패:', err)
    callback(null)
  })
}

/** 대시보드·카드 공통 요약 문구용 숫자 포맷 */
export function formatFitValue(v, digits) {
  return v != null && Number.isFinite(v) ? v.toFixed(digits) : '-'
}
