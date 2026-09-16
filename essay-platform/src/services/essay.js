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
import { auth, db } from '../firebase.js'

// ─── 지문(essayPassages) CRUD ──────────────────────────────────
//
// 교사별로 독립적으로 관리한다 — createdBy로 만든 사람을 표시하고, list 계열 함수는
// teacherUid를 주면 본인 것만, 안 주면 전체(super_admin 전용, firestore.rules가 강제)를
// 돌려준다.

/**
 * 지문 생성 (createdBy는 현재 로그인 계정)
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
    createdBy: auth.currentUser?.uid || '',
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
 * @param {string} [teacherUid] 주면 그 교사가 만든 것만(교사용), 안 주면 전체(super_admin용)
 * @returns {Promise<Array>}
 */
export async function listPassages(teacherUid) {
  const q = teacherUid
    ? query(collection(db, 'essayPassages'), where('createdBy', '==', teacherUid))
    : collection(db, 'essayPassages')
  const snap = await getDocs(q)
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
 * 배정 생성 (createdBy는 현재 로그인 계정 — 이 배정으로 생기는 제출물도 같은 teacherUid를 갖는다)
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
    createdBy: auth.currentUser?.uid || '',
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
 * @param {string} [teacherUid] 주면 그 교사가 만든 것만(교사용), 안 주면 전체(super_admin용)
 * @returns {Promise<Array>}
 */
export async function listAssignments(teacherUid) {
  const q = teacherUid
    ? query(collection(db, 'essayAssignments'), where('createdBy', '==', teacherUid))
    : collection(db, 'essayAssignments')
  const snap = await getDocs(q)
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
 * @param {string} teacherUid 이 배정을 만든 교사 uid(essayAssignments.createdBy) — 제출물에도
 *   그대로 찍어둬야 그 교사의 대시보드 list 쿼리가 firestore.rules를 통과한다.
 * @returns {Promise<object>}
 */
export async function getOrCreateSubmission(assignmentId, student, teacherUid) {
  const id = submissionId(assignmentId, student.uid)
  const ref = doc(db, 'essaySubmissions', id)
  const snap = await getDoc(ref)
  if (snap.exists()) return { id, ...snap.data() }

  const initial = {
    assignmentId,
    teacherUid: teacherUid || '',
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
 * @param {string} [teacherUid] super_admin이 아닌 teacher가 부를 땐 반드시 넘겨야 한다 —
 *   firestore.rules의 list 규칙이 "teacherUid == 내 uid"를 증명 가능한 쿼리로 요구한다
 *   (규칙이 문서 하나하나가 아니라 쿼리 자체의 where절을 보고 통과 여부를 정하기 때문).
 * @returns {function} unsubscribe
 */
export function subscribeSubmissions(assignmentId, callback, teacherUid) {
  const clauses = [where('assignmentId', '==', assignmentId)]
  if (teacherUid) clauses.push(where('teacherUid', '==', teacherUid))
  const q = query(collection(db, 'essaySubmissions'), ...clauses)
  return onSnapshot(q, (snap) => {
    const items = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.studentName || '').localeCompare(b.studentName || '', 'ko'))
    callback(items)
  }, (err) => {
    console.error('제출물 구독 실패:', err)
    callback([])
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
