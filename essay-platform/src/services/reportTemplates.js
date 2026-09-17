import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp
} from 'firebase/firestore'
import { auth, db } from '../firebase.js'

// ─── 구조화된 응답 템플릿(reportTemplates) CRUD ─────────────────
//
// services/essay.js의 지문(essayPassages) CRUD와 완전히 같은 패턴 — 교사별로 독립적으로
// 관리한다(createdBy로 만든 사람을 표시, teacherUid를 주면 본인 것만/안 주면 전체).

/**
 * @typedef {object} TemplateSection
 * @property {string} id
 * @property {string} groupLabel  "Ⅰ. 탐구 주제" 같은 상위 구분 — 연속되면 화면에서 묶어 보여줌
 * @property {string} heading     "탐구 제목" 같은 입력란 라벨(그룹 자체가 입력란이면 빈 문자열 가능)
 * @property {string} guidance    학생에게 보여줄 안내 문구
 * @property {boolean} required
 * @property {number|null} wordLimitGuide
 */

/**
 * 템플릿 생성
 * @param {{title: string, description: string, sections: TemplateSection[]}} data
 * @returns {Promise<string>} templateId
 */
export async function createTemplate(data) {
  const docRef = await addDoc(collection(db, 'reportTemplates'), {
    title: data.title || '',
    description: data.description || '',
    sections: data.sections || [],
    active: true,
    createdBy: auth.currentUser?.uid || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  })
  return docRef.id
}

/**
 * 템플릿 수정
 * @param {string} templateId
 * @param {object} data
 */
export async function updateTemplate(templateId, data) {
  await updateDoc(doc(db, 'reportTemplates', templateId), {
    ...data,
    updatedAt: serverTimestamp()
  })
}

/**
 * 템플릿 단건 조회
 * @param {string} templateId
 * @returns {Promise<object|null>}
 */
export async function getTemplate(templateId) {
  const snap = await getDoc(doc(db, 'reportTemplates', templateId))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() }
}

/**
 * 템플릿 삭제. 이 템플릿을 쓰는 배정이 남아있으면 그 배정이 깨지므로(학생 화면에서 양식을
 * 못 찾아 에러가 남), 호출 전에 listAssignmentsUsingTemplate로 참조 여부를 먼저 확인해야 한다.
 * @param {string} templateId
 */
export async function deleteTemplate(templateId) {
  await deleteDoc(doc(db, 'reportTemplates', templateId))
}

/**
 * 이 템플릿을 templateId로 참조하는 배정 목록 — 삭제 전 경고/차단용.
 * @param {string} templateId
 * @returns {Promise<Array<{id: string, title: string}>>}
 */
export async function listAssignmentsUsingTemplate(templateId) {
  const snap = await getDocs(query(collection(db, 'essayAssignments'), where('templateId', '==', templateId)))
  return snap.docs.map(d => ({ id: d.id, title: d.data().title || '(제목 없음)' }))
}

/**
 * 템플릿 목록 조회 (최신순)
 * @param {string} [teacherUid] 주면 그 교사가 만든 것만(교사용), 안 주면 전체(super_admin용)
 * @returns {Promise<Array>}
 */
export async function listTemplates(teacherUid) {
  const q = teacherUid
    ? query(collection(db, 'reportTemplates'), where('createdBy', '==', teacherUid))
    : collection(db, 'reportTemplates')
  const snap = await getDocs(q)
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => {
      const ta = a.createdAt?.toDate?.() || new Date(0)
      const tb = b.createdAt?.toDate?.() || new Date(0)
      return tb - ta
    })
}
