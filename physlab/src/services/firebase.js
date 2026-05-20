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
 * 드로잉 및 점수 저장
 * @param {string} sessionId
 * @param {Array} drawnLines
 * @param {number} score
 */
export async function saveDrawingResult(sessionId, drawnLines, score) {
  await updateDoc(doc(db, 'sessions', sessionId), {
    drawnLines,
    score,
    step: 3,
    updatedAt: serverTimestamp()
  })
}

/**
 * 드로잉 자동저장 (점수 없이 drawnLines만)
 * @param {string} sessionId
 * @param {Array} drawnLines
 */
export async function saveDrawingLines(sessionId, drawnLines) {
  await updateDoc(doc(db, 'sessions', sessionId), {
    drawnLines,
    updatedAt: serverTimestamp()
  })
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
