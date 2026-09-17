import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
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

/**
 * 지문 삭제. 이 지문을 쓰는 배정이 남아있으면 그 배정이 깨지므로(학생 화면에서 지문을 못
 * 찾아 에러가 남), 호출 전에 listAssignmentsUsingPassage로 참조 여부를 먼저 확인해야 한다.
 * @param {string} passageId
 */
export async function deletePassage(passageId) {
  await deleteDoc(doc(db, 'essayPassages', passageId))
}

/**
 * 이 지문을 passageId로 참조하는 배정 목록 — 삭제 전 경고/차단용.
 * @param {string} passageId
 * @returns {Promise<Array<{id: string, title: string}>>}
 */
export async function listAssignmentsUsingPassage(passageId) {
  const snap = await getDocs(query(collection(db, 'essayAssignments'), where('passageId', '==', passageId)))
  return snap.docs.map(d => ({ id: d.id, title: d.data().title || '(제목 없음)' }))
}

// ─── 배정(essayAssignments) CRUD ───────────────────────────────

/**
 * 배정 생성 (createdBy는 현재 로그인 계정 — 이 배정으로 생기는 제출물도 같은 teacherUid를 갖는다)
 * @param {object} data {passageId, title, dueAt, wordLimit, responseType, templateId}
 *   responseType: 'essay'(기본, passageId 필수) | 'structured'(templateId 필수, passageId 선택)
 * @returns {Promise<string>} assignmentId
 */
/** 이메일의 @ 뒤 도메인만 뽑는다(없으면 빈 문자열) — 학생 계정이 배정을 만든 교사와 같은
 *  학교 도메인인지 비교하는 데 쓴다(services/users.js의 학번·이름 수동 입력 분기). */
function emailDomain(email) {
  const i = (email || '').indexOf('@')
  return i >= 0 ? email.slice(i + 1) : ''
}

export async function createAssignment(data) {
  const docRef = await addDoc(collection(db, 'essayAssignments'), {
    passageId: data.passageId || null,
    responseType: data.responseType || 'essay',
    templateId: data.templateId || null,
    title: data.title || '',
    dueAt: data.dueAt || null,
    wordLimit: data.wordLimit || null,
    status: 'open',
    classroom: null,
    createdBy: auth.currentUser?.uid || '',
    // 학생은 다른 사용자(교사)의 users/{uid} 문서를 읽을 권한이 없어서, 배정을 만들 때
    // 교사 이메일의 도메인만 이 문서에 함께 저장해둔다 — 학생 쪽에서 "같은 학교 도메인인지"를
    // 판단하는 유일한 방법이라 여기서 반드시 채워야 한다.
    teacherDomain: emailDomain(auth.currentUser?.email),
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
    // 예전에 만든 배정엔 teacherDomain이 없을 수 있다 — 수정할 때마다 채워 넣어 자연스럽게
    // 새 배정과 동일한 방식으로 동작하게 한다.
    teacherDomain: emailDomain(auth.currentUser?.email),
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

/**
 * 배정 삭제. 이미 들어온 학생 제출물(essaySubmissions)은 같이 지우지 않는다 — 작성 기록은
 * 보존하되, 배정 문서가 없어지면 목록/대시보드에서는 더 이상 접근할 수 없게 된다. 삭제 전
 * countSubmissionsForAssignment로 몇 건이 걸려있는지 미리 보여주는 걸 권장한다.
 * @param {string} assignmentId
 */
export async function deleteAssignment(assignmentId) {
  await deleteDoc(doc(db, 'essayAssignments', assignmentId))
}

/**
 * 배정에 달린 제출물 개수 — 삭제 확인 문구에 쓴다.
 * @param {string} assignmentId
 * @param {string} [teacherUid] teacher 역할로 부를 땐 반드시 넘겨야 한다(firestore.rules의
 *   list 규칙이 쿼리에 teacherUid where절을 요구함) — subscribeSubmissions와 같은 이유.
 * @returns {Promise<number>}
 */
export async function countSubmissionsForAssignment(assignmentId, teacherUid) {
  const clauses = [where('assignmentId', '==', assignmentId)]
  if (teacherUid) clauses.push(where('teacherUid', '==', teacherUid))
  const snap = await getDocs(query(collection(db, 'essaySubmissions'), ...clauses))
  return snap.size
}

// ─── 제출물(essaySubmissions) ───────────────────────────────────

function submissionId(assignmentId, uid) {
  return `${assignmentId}__${uid}`
}

const emptySectionAnswer = () => ({
  text: '',
  charCount: 0,
  pasteCount: 0,
  pastedCharTotal: 0,
  keydownCount: 0,
  inputEventCount: 0,
  aiFlags: { phraseMatches: [], markdownHits: false, score: 0 }
})

/**
 * 제출물 문서를 없으면 생성하고(upsert), 항상 최신 데이터를 반환
 * @param {string} assignmentId
 * @param {{uid: string, name: string, class: string}} student
 * @param {string} teacherUid 이 배정을 만든 교사 uid(essayAssignments.createdBy) — 제출물에도
 *   그대로 찍어둬야 그 교사의 대시보드 list 쿼리가 firestore.rules를 통과한다.
 * @param {Array<{id:string}>} [templateSections] 구조화된 응답(reportTemplates.sections)이면
 *   넘긴다 — 각 섹션 키를 빈 값으로 미리 채워둬서 화면 코드가 "이 키가 있는지"를 매번
 *   체크하지 않아도 되게 한다. 안 넘기면 지금까지의 essay 타입(text 한 칸)으로 만든다.
 * @returns {Promise<object>}
 */
export async function getOrCreateSubmission(assignmentId, student, teacherUid, templateSections) {
  const id = submissionId(assignmentId, student.uid)
  const ref = doc(db, 'essaySubmissions', id)
  const snap = await getDoc(ref)
  if (snap.exists()) return { id, ...snap.data() }

  const base = {
    assignmentId,
    teacherUid: teacherUid || '',
    studentUid: student.uid,
    studentName: student.name || '',
    studentClass: student.class || '',
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

  const initial = templateSections?.length
    ? {
      ...base,
      sections: Object.fromEntries(templateSections.map(sec => [sec.id, emptySectionAnswer()]))
    }
    : { ...base, text: '' }

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
 * 구조화된 응답(섹션별) 초안 자동저장 — essay 타입의 saveSubmissionDraft에 대응.
 * charCount는 섹션 합계로 다시 계산해 최상위에도 저장해둔다(대시보드가 매번 섹션을 다
 * 훑지 않아도 되게).
 * @param {string} subId
 * @param {Record<string, {text:string, charCount:number, aiFlags:object}>} sections
 */
export async function saveSectionsDraft(subId, sections) {
  await updateDoc(doc(db, 'essaySubmissions', subId), {
    sections,
    charCount: sumSectionCharCounts(sections),
    lastSavedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  })
}

/**
 * 구조화된 응답 최종 제출 (잠금) — essay 타입의 submitSubmission에 대응.
 * 필수 섹션이 비어있는지 같은 검증은 호출부(StructuredReportEditor)에서 미리 한다.
 * @param {string} subId
 * @param {Record<string, {text:string, charCount:number, aiFlags:object}>} sections
 */
export async function submitSections(subId, sections) {
  await updateDoc(doc(db, 'essaySubmissions', subId), {
    sections,
    charCount: sumSectionCharCounts(sections),
    status: 'submitted',
    submittedAt: serverTimestamp(),
    lastSavedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  })
}

function sumSectionCharCounts(sections) {
  return Object.values(sections || {}).reduce((sum, s) => sum + (s.charCount || 0), 0)
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
//
// essay 타입은 이벤트에 sectionId가 없다 — 지금까지처럼 제출물 최상위 카운터를 올린다.
// structured 타입은 이벤트마다 sectionId가 실려 온다 — 그 섹션의 카운터(sections.{id}.*)만
// dot-path로 올린다. 한 배치 안에 여러 섹션 이벤트가 섞일 수 있어(학생이 짧은 시간에
// 섹션을 오가며 입력) 섹션별로 개수를 모아 각각 increment한다.

/** events에 sectionId가 하나라도 있으면 {sectionId: count} 맵을, 없으면 null을 돌려준다. */
function countBySection(events) {
  const counts = {}
  let found = false
  for (const e of events) {
    if (e.sectionId) {
      found = true
      counts[e.sectionId] = (counts[e.sectionId] || 0) + 1
    }
  }
  return found ? counts : null
}

/**
 * input 이벤트 배치 저장 + 누적 카운트 갱신
 * @param {string} subId
 * @param {Array<{t:number, value:string, selStart:number, inputType:string, sectionId?:string}>} events
 */
export async function appendInputLogBatch(subId, events) {
  const batch = writeBatch(db)
  const logRef = doc(collection(db, 'essaySubmissions', subId, 'inputLogs'))
  batch.set(logRef, { events, createdAt: serverTimestamp() })

  const subRef = doc(db, 'essaySubmissions', subId)
  const bySection = countBySection(events)
  if (bySection) {
    const updates = {}
    for (const [sectionId, count] of Object.entries(bySection)) {
      updates[`sections.${sectionId}.inputEventCount`] = increment(count)
    }
    batch.update(subRef, updates)
  } else {
    batch.update(subRef, { inputEventCount: increment(events.length) })
  }
  await batch.commit()
}

/**
 * keydown 이벤트 배치 저장(타이밍 전용, 값은 저장 안 함) + 누적 카운트 갱신
 * @param {string} subId
 * @param {Array<{t:number, k:string, sectionId?:string}>} events
 */
export async function appendKeydownLogBatch(subId, events) {
  const batch = writeBatch(db)
  const logRef = doc(collection(db, 'essaySubmissions', subId, 'keydownLogs'))
  batch.set(logRef, { events, createdAt: serverTimestamp() })

  const subRef = doc(db, 'essaySubmissions', subId)
  const bySection = countBySection(events)
  if (bySection) {
    const updates = {}
    for (const [sectionId, count] of Object.entries(bySection)) {
      updates[`sections.${sectionId}.keydownCount`] = increment(count)
    }
    batch.update(subRef, updates)
  } else {
    batch.update(subRef, { keydownCount: increment(events.length) })
  }
  await batch.commit()
}

/**
 * 붙여넣기 이벤트 1건 저장 + 누적 카운트 갱신 (붙여넣기 자체는 막지 않음, 기록만)
 * @param {string} subId
 * @param {{t:number, text:string, charCount:number, cursorPos:number, resultingLength:number, sectionId?:string}} event
 */
export async function addPasteLog(subId, event) {
  const truncatedText = (event.text || '').slice(0, 5000)
  const batch = writeBatch(db)
  const logRef = doc(collection(db, 'essaySubmissions', subId, 'pasteLogs'))
  batch.set(logRef, { ...event, text: truncatedText, createdAt: serverTimestamp() })

  const subRef = doc(db, 'essaySubmissions', subId)
  if (event.sectionId) {
    batch.update(subRef, {
      [`sections.${event.sectionId}.pasteCount`]: increment(1),
      [`sections.${event.sectionId}.pastedCharTotal`]: increment(event.charCount || 0)
    })
  } else {
    batch.update(subRef, {
      pasteCount: increment(1),
      pastedCharTotal: increment(event.charCount || 0)
    })
  }
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
