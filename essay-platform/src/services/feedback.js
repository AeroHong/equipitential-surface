// 포스트잇 피드백(essayFeedback) — 문서 ID = 제출물 ID, 학생 한 명의 노트 전체를 notes 배열로 둔다.
// 학생은 교사가 공개(released)한 뒤에만 읽을 수 있다(firestore.rules). 공개 여부는 제출물에도
// feedbackReleased로 함께 찍는다 — 학생 화면은 이미 구독 중인 제출물로 공개 순간을 알아챈 뒤
// 피드백 문서를 구독한다(공개 전에 구독하면 권한 오류로 구독이 끊겨 버린다).
import { collection, doc, getDocs, onSnapshot, query, serverTimestamp, setDoc, where, writeBatch } from 'firebase/firestore'
import { db } from '../firebase.js'

/** 노트 색 — StickyNote.jsx·index.css(.fb-mark[data-color])와 같은 키를 쓴다. */
export const FEEDBACK_COLORS = ['yellow', 'pink', 'blue', 'green', 'purple']

function ownership(submission) {
  return {
    assignmentId: submission.assignmentId,
    teacherUid: submission.teacherUid || '',
    studentUid: submission.studentUid
  }
}

/**
 * @param {string} subId
 * @param {function(object|null): void} callback
 * @param {function(Error): void} [onError]
 * @returns {function} unsubscribe
 */
export function subscribeFeedback(subId, callback, onError) {
  return onSnapshot(doc(db, 'essayFeedback', subId), snap => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null)
  }, err => {
    console.error('피드백 구독 실패:', err)
    onError?.(err)
  })
}

/**
 * 노트 전체 저장(덮어쓰기). 노트 시각은 배열 안이라 serverTimestamp를 못 써서 Date.now() 숫자다.
 * @param {object} submission 대상 제출물(id/assignmentId/teacherUid/studentUid)
 * @param {Array<object>} notes
 */
export async function saveFeedbackNotes(submission, notes) {
  await setDoc(doc(db, 'essayFeedback', submission.id), {
    ...ownership(submission),
    notes,
    updatedAt: serverTimestamp()
  }, { merge: true })
}

/** 한 학생의 피드백 공개/비공개 */
export async function setFeedbackReleased(submission, released) {
  const batch = writeBatch(db)
  batch.set(doc(db, 'essayFeedback', submission.id), {
    ...ownership(submission),
    released,
    releasedAt: released ? serverTimestamp() : null
  }, { merge: true })
  batch.update(doc(db, 'essaySubmissions', submission.id), { feedbackReleased: released })
  await batch.commit()
}

/**
 * 배정 전체 피드백 공개/비공개 — 노트가 하나라도 있는 학생만 바꾼다.
 * @returns {Promise<number>} 바꾼 학생 수
 */
export async function releaseFeedbackForAssignment(assignmentId, teacherUid, released) {
  const snap = await getDocs(query(
    collection(db, 'essayFeedback'),
    where('teacherUid', '==', teacherUid),
    where('assignmentId', '==', assignmentId)
  ))
  const targets = snap.docs.filter(d => (d.data().notes || []).length > 0)
  // 학생 한 명당 쓰기 2번 — 배치 한도(500)를 넘지 않게 나눈다.
  for (let i = 0; i < targets.length; i += 200) {
    const batch = writeBatch(db)
    for (const d of targets.slice(i, i + 200)) {
      batch.update(d.ref, { released, releasedAt: released ? serverTimestamp() : null })
      batch.update(doc(db, 'essaySubmissions', d.id), { feedbackReleased: released })
    }
    await batch.commit()
  }
  return targets.length
}
