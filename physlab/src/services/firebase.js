import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  writeBatch,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp
} from 'firebase/firestore'
import { db } from '../firebase.js'

// ─── 세션 CRUD ───────────────────────────────────────────────

/**
 * 새 실험 세션 생성
 * @param {string} studentUid
 * @param {'point_electrode'|'line_electrode'} experimentType
 * @param {object} electrodeConfig
 * @returns {Promise<string>} sessionId
 */
export async function createSession(studentUid, experimentType, electrodeConfig) {
  const docRef = await addDoc(collection(db, 'sessions'), {
    studentUid,
    experimentType,
    electrodeConfig,
    measurements: [],
    drawnLines: [],
    score: null,
    step: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  })
  return docRef.id
}

/**
 * 세션 데이터 조회
 * @param {string} sessionId
 * @returns {Promise<object|null>}
 */
export async function getSession(sessionId) {
  const snap = await getDoc(doc(db, 'sessions', sessionId))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() }
}

/**
 * 측정값 업데이트 (전체 배열 교체)
 * @param {string} sessionId
 * @param {Array<{x:number, y:number, V:number}>} measurements
 */
export async function updateMeasurements(sessionId, measurements) {
  await updateDoc(doc(db, 'sessions', sessionId), {
    measurements,
    updatedAt: serverTimestamp()
  })
}

/**
 * 단계 업데이트
 * @param {string} sessionId
 * @param {1|2|3} step
 */
export async function updateStep(sessionId, step) {
  await updateDoc(doc(db, 'sessions', sessionId), {
    step,
    updatedAt: serverTimestamp()
  })
}

/**
 * Firestore는 nested array(배열 안 배열)를 미지원 → {points:[]} 객체로 직렬화
 */
function serializeLines(lines) {
  return lines.map(line => ({ points: line }))
}

/**
 * Firestore에서 로드한 drawnLines 역직렬화 (구형 포맷 호환)
 */
export function deserializeLines(lines) {
  if (!lines || !Array.isArray(lines)) return []
  return lines.map(l => Array.isArray(l) ? l : (l?.points || []))
}

/**
 * 드로잉 저장 (제출)
 */
export async function saveDrawingResult(sessionId, drawnLines) {
  await updateDoc(doc(db, 'sessions', sessionId), {
    drawnLines: serializeLines(drawnLines),
    step: 3,
    updatedAt: serverTimestamp()
  })
}

/**
 * 토론 답변 자동저장 (step 변경 없음 — 타이핑 중 debounce 저장용)
 */
export async function saveAnswersDraft(sessionId, answers) {
  await updateDoc(doc(db, 'sessions', sessionId), {
    answers,
    updatedAt: serverTimestamp()
  })
}

/**
 * 토론 답변 최종 저장 (step 4로 업데이트 = 실험 완료)
 */
export async function saveAnswers(sessionId, answers) {
  await updateDoc(doc(db, 'sessions', sessionId), {
    answers,
    step: 4,
    updatedAt: serverTimestamp()
  })
}

// ─── 토론 질문 관리 (settings 컬렉션) ─────────────────────────

const DEFAULT_QUESTIONS = [
  { id: 'q1', text: '측정한 등전위선의 모양은 어떠했나요? 전극의 종류(점전극/선전극)에 따라 어떻게 달라지는지 설명하세요.', order: 1 },
  { id: 'q2', text: '전기력선과 등전위선은 어떤 관계가 있나요? 직접 그린 전기력선과 등전위선을 비교하여 설명하세요.', order: 2 },
  { id: 'q3', text: '전극 가까운 곳과 먼 곳에서 등전위선 간격이 다른 이유는 무엇인가요? 전기장의 세기와 연결하여 설명하세요.', order: 3 },
  { id: 'q4', text: '실험 측정값에 오차가 발생했다면 원인은 무엇이라고 생각하나요? 오차를 줄이는 방법도 제안해 보세요.', order: 4 },
  { id: 'q5', text: '이번 실험에서 새롭게 알게 된 점, 또는 더 탐구해 보고 싶은 점을 자유롭게 작성하세요.', order: 5 },
]

/**
 * 토론 질문 목록 조회
 * @returns {Promise<Array<{id, text, order}>>}
 */
export async function getDiscussionQuestions() {
  const snap = await getDoc(doc(db, 'settings', 'discussion_questions'))
  if (!snap.exists() || !snap.data().questions?.length) return DEFAULT_QUESTIONS
  return snap.data().questions
}

/**
 * 토론 질문 저장 (admin용)
 * @param {Array<{id, text, order}>} questions
 */
export async function saveDiscussionQuestions(questions) {
  await setDoc(doc(db, 'settings', 'discussion_questions'), {
    questions,
    updatedAt: serverTimestamp()
  })
}

/**
 * 드로잉 자동저장
 */
export async function saveDrawingLines(sessionId, drawnLines) {
  await updateDoc(doc(db, 'sessions', sessionId), {
    drawnLines: serializeLines(drawnLines),
    updatedAt: serverTimestamp()
  })
}

// ─── 토론 기록 (사용자별 독립 저장) ──────────────────────────

/**
 * 학생의 토론 답변 기록 조회
 */
export async function getDiscussionRecord(uid) {
  const snap = await getDoc(doc(db, 'discussions', uid))
  if (!snap.exists()) return { answers: {}, completed: false }
  return snap.data()
}

/**
 * 토론 답변 자동저장 (draft)
 */
export async function saveDiscussionDraft(uid, answers) {
  await setDoc(doc(db, 'discussions', uid), {
    answers,
    updatedAt: serverTimestamp()
  }, { merge: true })
}

/**
 * 토론 답변 최종 제출 (completed=true)
 */
export async function saveDiscussionFinal(uid, answers) {
  await setDoc(doc(db, 'discussions', uid), {
    answers,
    completed: true,
    updatedAt: serverTimestamp()
  }, { merge: true })
}

/**
 * 학생별 세션 목록 조회
 * @param {string} studentUid
 * @returns {Promise<Array>}
 */
export async function getStudentSessions(studentUid) {
  const q = query(
    collection(db, 'sessions'),
    where('studentUid', '==', studentUid)
  )
  const snap = await getDocs(q)
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => {
      const ta = a.createdAt?.toDate?.() || new Date(0)
      const tb = b.createdAt?.toDate?.() || new Date(0)
      return tb - ta
    })
}

// ─── 사용자 CRUD ─────────────────────────────────────────────

/**
 * 사용자 정보 조회
 * @param {string} uid
 * @returns {Promise<object|null>}
 */
export async function getUser(uid) {
  const snap = await getDoc(doc(db, 'users', uid))
  if (!snap.exists()) return null
  return { uid: snap.id, ...snap.data() }
}

/**
 * 사용자 정보 업데이트 (학급 등)
 * @param {string} uid
 * @param {object} data
 */
export async function updateUser(uid, data) {
  await setDoc(doc(db, 'users', uid), { ...data, updatedAt: serverTimestamp() }, { merge: true })
}

// ─── 관리자: 실시간 학생 목록 ─────────────────────────────────

/**
 * 모든 학생 실시간 구독 (admin용)
 * @param {function} callback
 * @returns {function} unsubscribe
 */
export function subscribeAllStudents(callback) {
  // orderBy 제거 → 복합 인덱스 불필요, JS에서 정렬
  const q = query(
    collection(db, 'users'),
    where('role', '==', 'student')
  )
  return onSnapshot(q, (snap) => {
    const students = snap.docs
      .map(d => ({ uid: d.id, ...d.data() }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'))
    callback(students)
  })
}

/**
 * 모든 세션 실시간 구독 (admin용)
 * @param {function} callback
 * @returns {function} unsubscribe
 */
export function subscribeAllSessions(callback) {
  const q = query(
    collection(db, 'sessions'),
    orderBy('updatedAt', 'desc')
  )
  return onSnapshot(q, (snap) => {
    const sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    callback(sessions)
  })
}

/**
 * 단일 실험 세션 삭제
 * @param {string} sessionId
 */
export async function deleteSession(sessionId) {
  await deleteDoc(doc(db, 'sessions', sessionId))
}

/**
 * 학생 + 해당 학생의 모든 세션 삭제
 * @param {string} uid
 */
export async function deleteStudent(uid) {
  // 1. 해당 학생의 세션 모두 조회
  const q = query(collection(db, 'sessions'), where('studentUid', '==', uid))
  const snap = await getDocs(q)
  // 2. batch delete
  const batch = writeBatch(db)
  snap.docs.forEach(d => batch.delete(d.ref))
  batch.delete(doc(db, 'users', uid))
  await batch.commit()
}

/**
 * 특정 학생의 세션 실시간 구독
 * @param {string} studentUid
 * @param {function} callback
 * @returns {function} unsubscribe
 */
export function subscribeStudentSessions(studentUid, callback) {
  // orderBy 제거 → 복합 인덱스 불필요, JS에서 정렬
  const q = query(
    collection(db, 'sessions'),
    where('studentUid', '==', studentUid)
  )
  return onSnapshot(q, (snap) => {
    const sessions = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const ta = a.createdAt?.toDate?.() || new Date(0)
        const tb = b.createdAt?.toDate?.() || new Date(0)
        return tb - ta
      })
    callback(sessions)
  })
}
