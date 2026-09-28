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
 * @property {number|null} maxScore  배점(선택) — 'essay_calculator' 배정의 채점(services/essay.js
 *   의 saveGrading)에서 이 섹션의 만점으로 쓰인다. structured 배정에 쓰이는 템플릿이면 무시됨.
 * @property {string} [promptHtml]  문항 본문(서식·이미지 포함 HTML) — kind가 'question_set'인
 *   템플릿에서만 쓴다. 학생 화면에서 입력란 위에 그대로 보여준다.
 */

/**
 * 템플릿 종류. 같은 reportTemplates 컬렉션에 저장하고 섹션 구조도 같아서, 배정/채점/리플레이/
 * 대시보드는 종류를 구분하지 않고 그대로 동작한다 — 작성 화면(관리 메뉴)만 다르다.
 * - 'report'(필드 없음 포함): 보고서 양식 — 그룹 라벨 + 소제목 + 안내 문구
 * - 'question_set': 서술형 문항 — 문항마다 서식·이미지가 들어간 본문(promptHtml)
 */
export const TEMPLATE_KIND_REPORT = 'report'
export const TEMPLATE_KIND_QUESTION_SET = 'question_set'

export function getTemplateKind(template) {
  return template?.kind === TEMPLATE_KIND_QUESTION_SET ? TEMPLATE_KIND_QUESTION_SET : TEMPLATE_KIND_REPORT
}

/**
 * 템플릿 생성
 * @param {{title: string, description: string, sections: TemplateSection[], kind?: string}} data
 * @returns {Promise<string>} templateId
 */
export async function createTemplate(data) {
  const docRef = await addDoc(collection(db, 'reportTemplates'), {
    title: data.title || '',
    description: data.description || '',
    sections: data.sections || [],
    kind: data.kind || TEMPLATE_KIND_REPORT,
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
