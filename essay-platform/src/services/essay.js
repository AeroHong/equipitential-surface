import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  onSnapshot,
  query,
  where,
  writeBatch,
  serverTimestamp,
  increment
} from 'firebase/firestore'
import { db } from '../firebase.js'

// ─── 지문(essayPassages) CRUD ──────────────────────────────────

/**
 * 지문 생성
 * @param {object} data {title, bodyText, imageUrls, videoUrl, questionPrompt, wordLimitGuide}
 * @returns {Promise<string>} passageId
 */
export async function createPassage(data) {
  const docRef = await addDoc(collection(db, 'essayPassages'), {
    title: data.title || '',
    bodyText: data.bodyText || '',
    bodyHtml: data.bodyHtml || '',
    imageUrls: data.imageUrls || [],
    videoUrl: data.videoUrl || '',
    questionPrompt: data.questionPrompt || '',
    wordLimitGuide: data.wordLimitGuide || 800,
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  })
  return docRef.id
}

/**
 * 지문 수정
 * @param {string} passageId
 * @param {object} data
 */
export async function updatePassage(passageId, data) {
  await updateDoc(doc(db, 'essayPassages', passageId), {
    ...data,
    updatedAt: serverTimestamp()
  })
}

/**
 * 지문 단건 조회
 * @param {string} passageId
 * @returns {Promise<object|null>}
 */
export async function getPassage(passageId) {
  const snap = await getDoc(doc(db, 'essayPassages', passageId))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() }
}

/**
 * 지문 목록 조회 (최신순, 클라이언트 정렬)
 * @returns {Promise<Array>}
 */
export async function listPassages() {
  const snap = await getDocs(collection(db, 'essayPassages'))
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => {
      const ta = a.createdAt?.toDate?.() || new Date(0)
      const tb = b.createdAt?.toDate?.() || new Date(0)
      return tb - ta
    })
}

// ─── 배정(essayAssignments) CRUD ───────────────────────────────

/**
 * 배정 생성
 * @param {object} data {passageId, title, dueAt, wordLimit}
 * @returns {Promise<string>} assignmentId
 */
export async function createAssignment(data) {
  const docRef = await addDoc(collection(db, 'essayAssignments'), {
    passageId: data.passageId,
    title: data.title || '',
    dueAt: data.dueAt || null,
    wordLimit: data.wordLimit || null,
    status: 'open',
    classroom: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  })
  return docRef.id
}

/**
 * 배정 수정 (Classroom 게시 정보, 마감 상태 등)
 * @param {string} assignmentId
 * @param {object} data
 */
export async function updateAssignment(assignmentId, data) {
  await updateDoc(doc(db, 'essayAssignments', assignmentId), {
    ...data,
    updatedAt: serverTimestamp()
  })
}

/**
 * 배정 단건 조회
 * @param {string} assignmentId
 * @returns {Promise<object|null>}
 */
export async function getAssignment(assignmentId) {
  const snap = await getDoc(doc(db, 'essayAssignments', assignmentId))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() }
}

/**
 * 배정 목록 조회 (최신순)
 * @returns {Promise<Array>}
 */
export async function listAssignments() {
  const snap = await getDocs(collection(db, 'essayAssignments'))
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => {
      const ta = a.createdAt?.toDate?.() || new Date(0)
      const tb = b.createdAt?.toDate?.() || new Date(0)
      return tb - ta
    })
}

// ─── 제출물(essaySubmissions) ───────────────────────────────────

function submissionId(assignmentId, uid) {
  return `${assignmentId}__${uid}`
}

/**
 * 제출물 문서를 없으면 생성하고(upsert), 항상 최신 데이터를 반환
 * @param {string} assignmentId
 * @param {{uid: string, name: string, class: string}} student
 * @returns {Promise<object>}
 */
export async function getOrCreateSubmission(assignmentId, student) {
  const id = submissionId(assignmentId, student.uid)
  const ref = doc(db, 'essaySubmissions', id)
  const snap = await getDoc(ref)
  if (snap.exists()) return { id, ...snap.data() }

  const initial = {
    assignmentId,
    studentUid: student.uid,
    studentName: student.name || '',
    studentClass: student.class || '',
    text: '',
    charCount: 0,
    status: 'draft',
    startedAt: serverTimestamp(),
    lastSavedAt: serverTimestamp(),
    submittedAt: null,
    pasteCount: 0,
    pastedCharTotal: 0,
    keydownCount: 0,
    inputEventCount: 0,
    aiFlags: { phraseMatches: [], markdownHits: false, score: 0 },
    updatedAt: serverTimestamp()
  }
  await setDoc(ref, initial)
  return { id, ...initial }
}

/**
 * 작성 중 초안 자동저장 (status 변경 없음)
 * @param {string} subId
 * @param {{text: string, charCount: number, aiFlags: object}} data
 */
export async function saveSubmissionDraft(subId, data) {
  await updateDoc(doc(db, 'essaySubmissions', subId), {
    text: data.text,
    charCount: data.charCount,
    aiFlags: data.aiFlags,
    lastSavedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  })
}

/**
 * 최종 제출 (잠금)
 * @param {string} subId
 * @param {{text: string, charCount: number, aiFlags: object}} data
 */
export async function submitSubmission(subId, data) {
  await updateDoc(doc(db, 'essaySubmissions', subId), {
    text: data.text,
    charCount: data.charCount,
    aiFlags: data.aiFlags,
    status: 'submitted',
    submittedAt: serverTimestamp(),
    lastSavedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  })
}

/**
 * 제출 잠금 해제 (교사 전용 — 재수정 허용)
 * @param {string} subId
 */
export async function reopenSubmission(subId) {
  await updateDoc(doc(db, 'essaySubmissions', subId), {
    status: 'draft',
    updatedAt: serverTimestamp()
  })
}

/**
 * 배정별 제출물 실시간 구독 (교사 대시보드용)
 * @param {string} assignmentId
 * @param {function} callback
 * @returns {function} unsubscribe
 */
export function subscribeSubmissions(assignmentId, callback) {
  const q = query(
    collection(db, 'essaySubmissions'),
    where('assignmentId', '==', assignmentId)
  )
  return onSnapshot(q, (snap) => {
    const items = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.studentName || '').localeCompare(b.studentName || '', 'ko'))
    callback(items)
  })
}

/**
 * 제출물 단건 조회
 * @param {string} subId
 * @returns {Promise<object|null>}
 */
export async function getSubmission(subId) {
  const snap = await getDoc(doc(db, 'essaySubmissions', subId))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() }
}

// ─── 작성 로그 (리플레이용) ─────────────────────────────────────

/**
 * input 이벤트 배치 저장 + 누적 카운트 갱신
 * @param {string} subId
 * @param {Array<{t:number, value:string, selStart:number, inputType:string}>} events
 */
export async function appendInputLogBatch(subId, events) {
  const batch = writeBatch(db)
  const logRef = doc(collection(db, 'essaySubmissions', subId, 'inputLogs'))
  batch.set(logRef, { events, createdAt: serverTimestamp() })
  batch.update(doc(db, 'essaySubmissions', subId), {
    inputEventCount: increment(events.length)
  })
  await batch.commit()
}

/**
 * keydown 이벤트 배치 저장(타이밍 전용, 값은 저장 안 함) + 누적 카운트 갱신
 * @param {string} subId
 * @param {Array<{t:number, k:string}>} events
 */
export async function appendKeydownLogBatch(subId, events) {
  const batch = writeBatch(db)
  const logRef = doc(collection(db, 'essaySubmissions', subId, 'keydownLogs'))
  batch.set(logRef, { events, createdAt: serverTimestamp() })
  batch.update(doc(db, 'essaySubmissions', subId), {
    keydownCount: increment(events.length)
  })
  await batch.commit()
}

/**
 * 붙여넣기 이벤트 1건 저장 + 누적 카운트 갱신 (붙여넣기 자체는 막지 않음, 기록만)
 * @param {string} subId
 * @param {{t:number, text:string, charCount:number, cursorPos:number, resultingLength:number}} event
 */
export async function addPasteLog(subId, event) {
  const truncatedText = (event.text || '').slice(0, 5000)
  const batch = writeBatch(db)
  const logRef = doc(collection(db, 'essaySubmissions', subId, 'pasteLogs'))
  batch.set(logRef, { ...event, text: truncatedText, createdAt: serverTimestamp() })
  batch.update(doc(db, 'essaySubmissions', subId), {
    pasteCount: increment(1),
    pastedCharTotal: increment(event.charCount || 0)
  })
  await batch.commit()
}

/**
 * 리플레이용 전체 로그 조회 — input/keydown/paste 서브컬렉션을 모두 읽어
 * 각 이벤트를 t 기준 하나의 타임라인으로 병합해 반환
 * @param {string} subId
 * @returns {Promise<{inputEvents: Array, keydownEvents: Array, pasteEvents: Array}>}
 */
export async function getReplayLogs(subId) {
  const [inputSnap, keydownSnap, pasteSnap] = await Promise.all([
    getDocs(collection(db, 'essaySubmissions', subId, 'inputLogs')),
    getDocs(collection(db, 'essaySubmissions', subId, 'keydownLogs')),
    getDocs(collection(db, 'essaySubmissions', subId, 'pasteLogs'))
  ])

  const inputEvents = inputSnap.docs
    .flatMap(d => d.data().events || [])
    .sort((a, b) => a.t - b.t)

  const keydownEvents = keydownSnap.docs
    .flatMap(d => d.data().events || [])
    .sort((a, b) => a.t - b.t)

  const pasteEvents = pasteSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.t - b.t)

  return { inputEvents, keydownEvents, pasteEvents }
}
