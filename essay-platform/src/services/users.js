import {
  collection,
  doc,
  getDocs,
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
 * 대기 중인 교사 권한 요청 목록
 * @returns {Promise<Array>}
 */
export async function listTeacherRequests() {
  const q = query(collection(db, 'users'), where('role', '==', 'teacher_pending'))
  const snap = await getDocs(q)
  return snap.docs
    .map(d => ({ uid: d.id, ...d.data() }))
    .sort((a, b) => {
      const ta = a.roleRequestedAt?.toDate?.() || new Date(0)
      const tb = b.roleRequestedAt?.toDate?.() || new Date(0)
      return ta - tb
    })
}

/**
 * 현재 승인된 교사 목록 (super_admin 본인은 제외 — 별도 관리 대상이 아님)
 * @returns {Promise<Array>}
 */
export async function listTeachers() {
  const q = query(collection(db, 'users'), where('role', '==', 'teacher'))
  const snap = await getDocs(q)
  return snap.docs
    .map(d => ({ uid: d.id, ...d.data() }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'))
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
