import {
  collection,
  doc,
  onSnapshot,
  updateDoc,
  query,
  where,
  serverTimestamp
} from 'firebase/firestore'
import { db } from '../firebase.js'

// ─── 교사 권한 요청/승인 ─────────────────────────────────────
//
// role 값: 'student'(기본) → 'teacher_pending'(요청) → 'teacher'(승인) | 'student'(거절)
// firestore.rules가 'student' → 'teacher_pending' 전이만 본인에게 허용하고, 그 외 role
// 변경(teacher_pending → teacher/student 등)은 super_admin만 할 수 있다.

/**
 * 본인 계정에 교사 권한을 요청한다 (role: 'student' → 'teacher_pending')
 * @param {string} uid
 */
export async function requestTeacherRole(uid) {
  await updateDoc(doc(db, 'users', uid), {
    role: 'teacher_pending',
    roleRequestedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  })
}

/**
 * 대기 중인 교사 권한 요청 목록을 실시간으로 구독한다 — 다른 교사가 요청을 넣으면
 * super_admin 화면이 새로고침 없이 바로 갱신된다. 구독 해제 함수를 반환한다.
 * @param {(requests: Array) => void} callback
 * @returns {() => void}
 */
export function watchTeacherRequests(callback) {
  const q = query(collection(db, 'users'), where('role', '==', 'teacher_pending'))
  return onSnapshot(q, snap => {
    callback(snap.docs
      .map(d => ({ uid: d.id, ...d.data() }))
      .sort((a, b) => {
        const ta = a.roleRequestedAt?.toDate?.() || new Date(0)
        const tb = b.roleRequestedAt?.toDate?.() || new Date(0)
        return ta - tb
      }))
  }, err => {
    console.error('교사 권한 요청 목록 구독 실패:', err)
    callback([])
  })
}

/**
 * 현재 승인된 교사 목록을 실시간으로 구독한다(super_admin 본인은 제외 — 별도 관리 대상이 아님).
 * 구독 해제 함수를 반환한다.
 * @param {(teachers: Array) => void} callback
 * @returns {() => void}
 */
export function watchTeachers(callback) {
  const q = query(collection(db, 'users'), where('role', '==', 'teacher'))
  return onSnapshot(q, snap => {
    callback(snap.docs
      .map(d => ({ uid: d.id, ...d.data() }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko')))
  }, err => {
    console.error('교사 목록 구독 실패:', err)
    callback([])
  })
}

/** 교사 권한 요청 승인 (super_admin 전용 — firestore.rules가 강제) */
export async function approveTeacherRequest(uid) {
  await updateDoc(doc(db, 'users', uid), {
    role: 'teacher',
    roleApprovedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  })
}

/** 교사 권한 요청 거절 — 다시 student로 되돌린다 */
export async function rejectTeacherRequest(uid) {
  await updateDoc(doc(db, 'users', uid), {
    role: 'student',
    updatedAt: serverTimestamp()
  })
}

/** 이미 승인된 교사 권한 해제 */
export async function revokeTeacherRole(uid) {
  await updateDoc(doc(db, 'users', uid), {
    role: 'student',
    updatedAt: serverTimestamp()
  })
}

// ─── 학생 본인 확인(학번·이름 수동 입력) ─────────────────────────
//
// 과제 링크에 클래스룸 연동 없이 접속한 학생은, 로그인한 구글 계정이 그 과제를 만든 교사와
// 같은 학교 도메인이면 구글 표시 이름을 그대로 쓴다(위조/확인 부담이 적다고 보고 그대로
// 신뢰). 도메인이 다르면(개인 계정) 본인이 누구인지 구글 계정만으론 알 수 없으므로, 학번과
// 이름을 한 번 입력받아 그 계정에 영구히 붙여둔다(manualIdentity: true — 이후 다른 배정에서도
// 다시 물어보지 않는다). pages/student/EssayWritePage.jsx에서 사용.

/**
 * 개인 계정 학생의 학번·이름을 저장한다. 이후 name으로 "학번-이름"이 그대로 쓰인다.
 * @param {string} uid
 * @param {{ studentId: string, name: string }} identity
 */
export async function setManualStudentIdentity(uid, { studentId, name }) {
  await updateDoc(doc(db, 'users', uid), {
    name: `${studentId.trim()}-${name.trim()}`,
    manualIdentity: true,
    updatedAt: serverTimestamp()
  })
}
