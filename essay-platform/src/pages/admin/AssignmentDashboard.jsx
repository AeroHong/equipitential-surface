import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ref, onValue } from 'firebase/database'
import { useAuth } from '../../App.jsx'
import { getAssignment, getPassage, subscribeSubmissions, reopenSubmission, updateAssignment, releaseScores, getAssignmentClassrooms, startExam, pauseExam, resumeExam, openMakeupExam, clearMakeupExam, linkSubmissionToRoster, forceSubmitSubmission, saveTeacherMemo, subscribeTeacherMemos } from '../../services/essay.js'
import { getTemplate } from '../../services/reportTemplates.js'
import { rtdb } from '../../firebase.js'
import AiFlagBadge from '../../components/AiFlagBadge.jsx'
import PresenceBadge from '../../components/PresenceBadge.jsx'
import { htmlToPlainText } from '../../utils/richText.js'
import { nowForDatetimeLocal } from '../../utils/datetimeLocal.js'
import { getExamDeadlineMs, getPausedAtMs } from '../../utils/examTimer.js'
import { useServerTimeOffset } from '../../hooks/useServerTimeOffset.js'
import ExamTimer from '../../components/ExamTimer.jsx'
import LeaveAlerts from '../../components/LeaveAlerts.jsx'
import { isFocusGuardActive, formatDuration } from '../../utils/focusGuard.js'
import { hasClassroomConfig, signInToClassroom, listMyCourses, createCourseWork, updateCourseWorkDescription, courseWorkExists, getClassroomErrorMessage, getCourseStudentCount, listCourseStudents, isClassroomConnected } from '../../services/classroom.js'

/** handlePublishToClassroom과 반드시 같은 문구를 써야 한다 — "설명 동기화" 버튼이
 * 이미 게시된 과제를 이 문구로 덮어쓰기 때문. */
function buildCourseWorkDescription(assignmentId) {
  const linkUrl = `${window.location.origin}/write/${assignmentId}`
  return `서술형 수행평가입니다. 아래 링크에서 지문을 읽고 답안을 작성해주세요.\n${linkUrl}`
}

// 필터 탭에서 "명단에서 못 찾은 학생"을 고르는 값 — 실제 courseId와 절대 안 겹치게 접두사를 둠.
const UNMATCHED_FILTER = '__unmatched__'
// 필터 탭에서 "명단엔 있는데 제출물이 없는 학생(결석 등)"을 고르는 값.
const ABSENT_FILTER = '__absent__'

// 불러온 명단은 이 기기에만 캐시한다 — 새로고침마다 Classroom 재로그인 없이 미참여 표시를
// 유지하려는 용도. 학생 이메일이 들어 있어 학생도 읽을 수 있는 배정 문서에는 넣지 않는다.
function rosterCacheKey(assignmentId) {
  return `essay-roster:${assignmentId}`
}
function readRosterCache(assignmentId) {
  try {
    const raw = localStorage.getItem(rosterCacheKey(assignmentId))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}
function writeRosterCache(assignmentId, data) {
  try {
    localStorage.setItem(rosterCacheKey(assignmentId), JSON.stringify(data))
  } catch {
    // 저장 공간이 없거나 막혀 있으면 이번 화면에서만 쓴다.
  }
}

function formatTime(ts) {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  const diff = Math.floor((Date.now() - d) / 1000)
  if (diff < 60) return `${diff}초 전`
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
  return d.toLocaleDateString('ko-KR')
}

function formatClock(ts) {
  const d = ts?.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}

export default function AssignmentDashboard() {
  const { assignmentId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [assignment, setAssignment] = useState(null)
  const [passage, setPassage] = useState(null)
  const [template, setTemplate] = useState(null)
  const [submissions, setSubmissions] = useState([])
  const [presenceMap, setPresenceMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)
  const [copied, setCopied] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [courses, setCourses] = useState(null)
  // 배정에 아직 안 걸린 수업들 중 "추가로 게시"할 대상 — 여러 개 동시 선택 가능.
  const [selectedCourseIds, setSelectedCourseIds] = useState([])
  const [publishing, setPublishing] = useState(false)
  const serverOffsetMs = useServerTimeOffset()
  const [checkingClassrooms, setCheckingClassrooms] = useState(false)
  // 나중에 게시할 때도 예약 게시(state: DRAFT + scheduledTime)를 걸 수 있다 — 배정 만들기
  // 화면(AssignmentEditor.jsx)과 같은 방식.
  const [publishMode, setPublishMode] = useState('now') // 'now' | 'scheduled'
  const [scheduledAtStr, setScheduledAtStr] = useState('')
  const [classroomError, setClassroomError] = useState('')
  // 클래스룸별 학생 수 — {courseId: {count, updatedAt}}. 배정 하나에 여러 수업이 걸릴 수
  // 있어서(assignment.classrooms) 단일 값이 아니라 courseId로 찾는 맵으로 관리한다.
  const [classroomCounts, setClassroomCounts] = useState({})
  const [fetchingCountFor, setFetchingCountFor] = useState(null) // 지금 조회 중인 courseId
  const [releasingAll, setReleasingAll] = useState(false)
  const [startingExam, setStartingExam] = useState(false)
  const [syncingFor, setSyncingFor] = useState(null) // 지금 설명을 다시 동기화 중인 courseId
  // 제출자 이메일 ↔ 소속 수업 매칭 — "명단 불러오기"를 눌러야 채워진다(Classroom 로그인
  // 필요). 안 눌러도 나머지 기능엔 지장 없고, 그냥 반별 필터/구분 표시가 안 될 뿐이다.
  // {email: {courseId, name}} — null: 아직 안 불러옴, {}: 불러왔지만 빈 수업들
  const [roster, setRoster] = useState(() => readRosterCache(assignmentId)?.roster || null)
  const [rosterLoadedAt, setRosterLoadedAt] = useState(() => readRosterCache(assignmentId)?.loadedAt || null)
  const [loadingRoster, setLoadingRoster] = useState(false)
  const [groupFilter, setGroupFilter] = useState('all') // 'all' | courseId | UNMATCHED_FILTER | ABSENT_FILTER
  const [highlightSubId, setHighlightSubId] = useState(null) // 이탈 알림에서 고른 학생 행 강조
  const [selectedAbsent, setSelectedAbsent] = useState([]) // 추가 응시를 열어줄 미참여 학생 이메일
  const [openingMakeup, setOpeningMakeup] = useState(false)
  const [linkTarget, setLinkTarget] = useState(null) // 제출물과 연결할 미참여 학생 {email, name, courseId}
  const [linking, setLinking] = useState(false)

  useEffect(() => {
    let unsub = () => {}
    getAssignment(assignmentId).then(async a => {
      // 본인이 만든 배정의 대시보드만 볼 수 있다 — URL을 직접 알아도 남의 제출 현황은 안
      // 보이게 막는다(firestore.rules의 list 규칙도 어차피 막지만, 빈 화면으로만 보이면
      // 왜 안 보이는지 알기 어렵다).
      if (a && a.createdBy !== user.uid) {
        setAccessDenied(true)
        setLoading(false)
        return
      }
      setAssignment(a)
      // 마지막으로 확인했던 학생 수를 배정 문서에 저장해두고, 다음 접속(토큰이 없는 새
      // 세션)에서도 바로 보여준다 — "새로고침" 버튼은 그 저장값을 최신으로 다시 갱신한다.
      const initialCounts = {}
      for (const c of getAssignmentClassrooms(a)) {
        if (c.studentCount != null) initialCounts[c.courseId] = { count: c.studentCount, updatedAt: c.studentCountUpdatedAt }
      }
      setClassroomCounts(initialCounts)
      if (a?.passageId) setPassage(await getPassage(a.passageId))
      if ((a?.responseType === 'structured' || a?.responseType === 'essay_calculator') && a.templateId) setTemplate(await getTemplate(a.templateId))
      unsub = subscribeSubmissions(assignmentId, data => { setSubmissions(data); setLoading(false) }, user.uid)
    })
    return () => unsub()
  }, [assignmentId, user])

  // 실시간 접속/입력 현황(presence) — Firestore 제출물 구독과는 별개로, RTDB의
  // presence/{assignmentId} 아래 학생들 전체를 한 번에 구독한다. RTDB가 설정되지 않은
  // 환경(rtdb === null)에서는 구독하지 않고, 표는 항상 "—"(판정 불가)만 보여준다.
  useEffect(() => {
    if (!rtdb || !assignmentId) return
    const unsub = onValue(ref(rtdb, `presence/${assignmentId}`), (snap) => {
      setPresenceMap(snap.val() || {})
    })
    return () => unsub()
  }, [assignmentId])

  // 교사 메모 — 학생은 못 읽는 별도 컬렉션(essayTeacherMemos). {제출물 ID: 메모}
  const [memos, setMemos] = useState({})
  const [memoTarget, setMemoTarget] = useState(null) // 메모 창을 연 제출물
  const [memoDraft, setMemoDraft] = useState('')
  const [savingMemo, setSavingMemo] = useState(false)
  useEffect(() => {
    if (!assignmentId || !user) return
    return subscribeTeacherMemos(assignmentId, user.uid, setMemos)
  }, [assignmentId, user])

  function openMemo(sub) {
    setMemoTarget(sub)
    setMemoDraft(memos[sub.id] || '')
  }

  async function handleSaveMemo() {
    if (!memoTarget) return
    setSavingMemo(true)
    try {
      await saveTeacherMemo(memoTarget, memoDraft.trim())
      setMemoTarget(null)
    } catch (err) {
      console.error('메모 저장 실패:', err)
      alert('메모 저장 중 오류가 발생했습니다.')
    } finally {
      setSavingMemo(false)
    }
  }

  // 부정행위 적발 등으로 작성 중인 학생을 즉시 제출 처리한다. 사유를 적으면 시각과 함께 메모에
  // 덧붙여 남긴다(나중에 학생·학부모 문의에 근거로 쓸 수 있게).
  async function handleForceSubmit(sub) {
    const reason = window.prompt(
      `${sub.studentName || '이 학생'}의 답안을 지금 강제 제출할까요?\n학생 화면이 즉시 잠기고, 마지막으로 자동 저장된 내용이 제출됩니다.\n\n사유(선택, 메모에 기록됩니다):`,
      ''
    )
    if (reason === null) return
    try {
      await forceSubmitSubmission(sub.id)
      const stamp = new Date().toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      const line = `[${stamp} 강제 제출]${reason.trim() ? ` ${reason.trim()}` : ''}`
      const prev = memos[sub.id] || ''
      await saveTeacherMemo(sub, prev ? `${prev}\n${line}` : line)
    } catch (err) {
      console.error('강제 제출 실패:', err)
      alert('강제 제출 중 오류가 발생했습니다.')
    }
  }

  async function handleReopen(sub) {
    if (!window.confirm(`${sub.studentName} 학생의 제출을 다시 열까요? 학생이 재수정할 수 있게 됩니다.`)) return
    await reopenSubmission(sub.id)
  }

  // "서술형 평가-문항"(essay_calculator) 전용 — 학생별로 하나씩 공개하는 것(ReplayView.jsx의
  // GradingPanel)과 별개로, 채점을 다 마친 뒤 한 번에 전체 공개/비공개하고 싶을 때 쓴다.
  async function handleReleaseAll(released) {
    const label = released ? '전체 공개' : '전체 비공개'
    if (!window.confirm(`채점 결과를 ${submissions.length}명 학생에게 ${label} 처리할까요?`)) return
    setReleasingAll(true)
    try {
      await releaseScores(submissions.map(s => s.id), released)
    } catch (err) {
      console.error('채점 공개 상태 일괄 변경 실패:', err)
      alert('처리 중 오류가 발생했습니다.')
    } finally {
      setReleasingAll(false)
    }
  }

  async function handleToggleClosed() {
    if (!assignment) return
    const nextStatus = assignment.status === 'closed' ? 'open' : 'closed'
    await updateAssignment(assignmentId, { status: nextStatus })
    setAssignment(a => ({ ...a, status: nextStatus }))
  }

  // 미참여 학생 중 고른 학생만 응시할 수 있게 마감을 푼다 — 다른 학생은 들어와도 막힌다.
  async function handleOpenMakeup() {
    if (!assignment || selectedAbsent.length === 0) return
    const names = selectedAbsent.map(email => roster?.[email]?.name || email)
    const waitingNote = assignment.waitingRoomEnabled
      ? '\n\n대기실이 초기화됩니다. 학생들이 들어오면 "평가 시작"을 다시 눌러주세요(제한시간은 그때부터).'
      : ''
    if (!window.confirm(`다음 ${names.length}명만 응시할 수 있도록 마감을 해제할까요?\n${names.join(', ')}\n\n다른 학생은 과제 링크로 들어와도 응시할 수 없습니다.${waitingNote}`)) return
    setOpeningMakeup(true)
    try {
      await openMakeupExam(assignment, selectedAbsent)
      setAssignment(a => ({
        ...a,
        status: 'open',
        makeupEmails: selectedAbsent.map(e => e.toLowerCase()),
        ...(a.waitingRoomEnabled ? { examStartedAt: null, examPausedAt: null, pausedTotalMs: 0 } : {})
      }))
      setSelectedAbsent([])
    } catch (err) {
      console.error('추가 응시 열기 실패:', err)
      alert('추가 응시를 여는 중 오류가 발생했습니다.')
    } finally {
      setOpeningMakeup(false)
    }
  }

  async function handleClearMakeup() {
    if (!window.confirm('추가 응시 대상 제한을 해제할까요? 이후에는 과제 링크로 들어오는 모든 학생이 응시할 수 있습니다.')) return
    await clearMakeupExam(assignmentId)
    setAssignment(a => ({ ...a, makeupEmails: undefined }))
  }

  function toggleAbsentSelected(email) {
    setSelectedAbsent(prev => (prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]))
  }

  // 대기실(waitingRoomEnabled) 배정 전용 — 학생 화면은 배정 문서를 실시간 구독하고 있어서
  // examStartedAt이 채워지는 즉시 문항을 불러온다.
  async function handleStartExam() {
    if (!window.confirm('평가를 시작할까요? 접속 중인 모든 학생 화면에 바로 문항이 나타납니다.')) return
    setStartingExam(true)
    try {
      await startExam(assignmentId)
      setAssignment(a => ({ ...a, examStartedAt: new Date() }))
    } catch (err) {
      console.error('평가 시작 실패:', err)
      alert('평가 시작 중 오류가 발생했습니다.')
    } finally {
      setStartingExam(false)
    }
  }

  // 일시정지("대기실로 보내기") — 작성 중인 학생도 문항이 가려지고 대기실 화면으로 바뀌며
  // 남은 시간이 멈춘다. 재개하면 멈춘 시간만큼 제한시간이 뒤로 밀린다.
  async function handlePauseExam() {
    if (!window.confirm('평가를 일시정지하고 모든 학생을 대기실로 보낼까요? 작성 중인 답안은 저장된 채로 가려지고, 남은 시간이 멈춥니다. "평가 재개"를 누르면 이어서 작성합니다.')) return
    await pauseExam(assignmentId)
    setAssignment(a => ({ ...a, examPausedAt: new Date(Date.now() + serverOffsetMs) }))
  }

  async function handleResumeExam() {
    const pausedAt = getPausedAtMs(assignment)
    const pausedMs = pausedAt != null ? Date.now() + serverOffsetMs - pausedAt : 0
    await resumeExam(assignmentId, pausedMs)
    setAssignment(a => ({ ...a, examPausedAt: null, pausedTotalMs: (Number(a.pausedTotalMs) || 0) + Math.max(0, Math.round(pausedMs)) }))
  }

  async function handleCopyStudentLink() {
    const link = `${window.location.origin}/write/${assignmentId}`
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('학생용 링크를 복사하세요.', link)
    }
  }

  // Classroom에서 직접 삭제된 과제를 이 배정의 연결 목록에서 걷어낸다. 연결할 때마다 자동으로
  // 한 번 돌고, "Classroom과 대조" 버튼으로도 부를 수 있다. 확인 실패(권한/네트워크)는 삭제로
  // 치지 않는다(courseWorkExists 참고).
  async function pruneDeletedClassrooms(current) {
    const linked = getAssignmentClassrooms(current)
    const failed = []
    const checks = await Promise.all(linked.map(async c => {
      if (!c.courseWorkId) return true
      try {
        return await courseWorkExists(c.courseId, c.courseWorkId)
      } catch (err) {
        console.warn(`Classroom 과제 확인 실패(${c.courseName || c.courseId}):`, err)
        failed.push({ name: c.courseName || c.courseId, message: getClassroomErrorMessage(err, '확인') })
        return true
      }
    }))
    const kept = linked.filter((_, i) => checks[i])
    const removed = linked.filter((_, i) => !checks[i])
    if (removed.length > 0) {
      await updateAssignment(assignmentId, { classrooms: kept, classroom: null })
      setAssignment(a => ({ ...a, classrooms: kept, classroom: null }))
    }
    return { removed, failed }
  }

  async function handleCheckClassrooms() {
    setClassroomError('')
    setCheckingClassrooms(true)
    try {
      if (!isClassroomConnected()) await signInToClassroom()
      const { removed, failed } = await pruneDeletedClassrooms(assignment)
      const lines = []
      if (removed.length > 0) lines.push(`Classroom에서 삭제된 과제 ${removed.length}개를 목록에서 뺐습니다: ${removed.map(c => c.courseName || c.courseId).join(', ')}`)
      if (failed.length > 0) lines.push(`다음 수업은 확인하지 못해 그대로 두었습니다(필요하면 카드의 ✕로 직접 빼주세요):\n${failed.map(f => `- ${f.name}: ${f.message}`).join('\n')}`)
      if (lines.length === 0) lines.push('모든 연결된 과제가 Classroom에 그대로 있습니다.')
      window.alert(lines.join('\n\n'))
    } catch (err) {
      console.error('Classroom 대조 실패:', err)
      setClassroomError(getClassroomErrorMessage(err, '확인'))
    } finally {
      setCheckingClassrooms(false)
    }
  }

  // Classroom 쪽은 건드리지 않고 이 배정의 연결 목록에서만 뺀다 — Classroom 권한이 없거나
  // 수업이 보관돼 확인이 안 되는 경우에도 교사가 직접 정리할 수 있게.
  async function handleUnlinkClassroom(courseId) {
    const target = getAssignmentClassrooms(assignment).find(c => c.courseId === courseId)
    if (!window.confirm(`"${target?.courseName || courseId}" 연결을 목록에서 뺄까요? Classroom의 과제 자체는 삭제되지 않습니다.`)) return
    const kept = getAssignmentClassrooms(assignment).filter(c => c.courseId !== courseId)
    await updateAssignment(assignmentId, { classrooms: kept, classroom: null })
    setAssignment(a => ({ ...a, classrooms: kept, classroom: null }))
  }

  async function handleConnectClassroom() {
    setClassroomError('')
    setConnecting(true)
    try {
      await signInToClassroom()
      const { removed } = await pruneDeletedClassrooms(assignment)
      if (removed.length > 0) {
        setClassroomError(`Classroom에서 삭제된 과제 ${removed.length}개를 목록에서 뺐습니다: ${removed.map(c => c.courseName || c.courseId).join(', ')}`)
      }
      const linkedIds = new Set(getAssignmentClassrooms(assignment).map(c => c.courseId).filter(id => !removed.some(r => r.courseId === id)))
      const list = await listMyCourses()
      setCourses(list)
      // 이미 이 배정에 걸린 수업은 기본 선택에서 빼준다 — 무심코 다시 체크하고 게시하면
      // 같은 반에 courseWork가 중복으로 생긴다.
      const notLinked = list.filter(c => !linkedIds.has(c.id))
      setSelectedCourseIds(notLinked.length ? [notLinked[0].id] : [])
    } catch (err) {
      console.error('Classroom 연결 실패:', err)
      setClassroomError(getClassroomErrorMessage(err))
    } finally {
      setConnecting(false)
    }
  }

  function toggleCourseSelected(courseId) {
    setSelectedCourseIds(prev => prev.includes(courseId) ? prev.filter(id => id !== courseId) : [...prev, courseId])
  }

  // 클래스룸 학생 수는 토큰이 있어야 조회되는데, 토큰은 페이지를 새로 열 때마다 초기화된다
  // (services/classroom.js는 모듈 메모리에만 토큰을 들고 있음, 새로고침 시 사라짐). 이미
  // 연결돼 있으면 그대로 조회하고, 아니면 조용히(팝업 없이) 먼저 연결부터 시도한다.
  async function handleFetchStudentCount(courseId) {
    setClassroomError('')
    setFetchingCountFor(courseId)
    try {
      if (!isClassroomConnected()) await signInToClassroom()
      const count = await getCourseStudentCount(courseId)
      const studentCountUpdatedAt = new Date()
      setClassroomCounts(prev => ({ ...prev, [courseId]: { count, updatedAt: studentCountUpdatedAt } }))
      const nextClassrooms = getAssignmentClassrooms(assignment).map(c =>
        c.courseId === courseId ? { ...c, studentCount: count, studentCountUpdatedAt } : c
      )
      await updateAssignment(assignmentId, { classrooms: nextClassrooms })
      setAssignment(a => ({ ...a, classrooms: nextClassrooms }))
    } catch (err) {
      console.error('클래스룸 학생 수 조회 실패:', err)
      setClassroomError(getClassroomErrorMessage(err, '학생 수 조회'))
    } finally {
      setFetchingCountFor(null)
    }
  }

  async function handlePublishToClassroom() {
    if (!assignment || selectedCourseIds.length === 0) return
    let scheduledAt = null
    if (publishMode === 'scheduled') {
      scheduledAt = new Date(scheduledAtStr)
      if (!scheduledAtStr || Number.isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) {
        alert('예약 시각은 지금보다 이후여야 합니다.')
        return
      }
    }
    setPublishing(true)
    setClassroomError('')
    try {
      const linkUrl = `${window.location.origin}/write/${assignmentId}`
      const dueDate = assignment.dueAt?.toDate?.() || undefined
      const added = []
      const failed = []
      for (const courseId of selectedCourseIds) {
        const course = courses.find(c => c.id === courseId)
        try {
          const result = await createCourseWork(courseId, {
            title: assignment.title,
            description: buildCourseWorkDescription(assignmentId),
            linkUrl,
            dueDate,
            scheduledAt: scheduledAt || undefined
          })
          added.push({
            courseId,
            courseWorkId: result.id,
            courseName: course?.name || '',
            alternateLink: result.alternateLink || '',
            scheduledAt: scheduledAt || null,
            postedAt: new Date()
          })
        } catch (err) {
          console.error(`Classroom 게시 실패(${course?.name || courseId}):`, err)
          failed.push(course?.name || courseId)
        }
      }
      if (added.length > 0) {
        // 이미 걸려있던 수업은 그대로 두고 새로 게시된 것만 이어붙인다(덮어쓰지 않음) —
        // 이게 "여러 수업 동시 배정"의 핵심. 예전엔 단일 classroom 필드를 통째로 갈아치워서
        // 먼저 게시한 수업의 연결이 사라졌었다.
        const nextClassrooms = [...getAssignmentClassrooms(assignment), ...added]
        await updateAssignment(assignmentId, { classrooms: nextClassrooms })
        setAssignment(a => ({ ...a, classrooms: nextClassrooms }))
      }
      setCourses(null)
      setSelectedCourseIds([])
      setPublishMode('now')
      setScheduledAtStr('')
      if (failed.length > 0) setClassroomError(`다음 수업에는 게시하지 못했습니다: ${failed.join(', ')}`)
    } catch (err) {
      console.error('Classroom 게시 실패:', err)
      setClassroomError(getClassroomErrorMessage(err, '게시'))
    } finally {
      setPublishing(false)
    }
  }

  // 이미 게시된 과제의 Classroom 설명을 지금 코드가 쓰는 문구로 다시 덮어쓴다 — 코드의 게시
  // 문구 템플릿이 바뀌어도(예: "물리학Ⅱ" 문구 제거) 예전에 게시된 과제는 게시 당시 저장된
  // 문구가 Classroom에 그대로 남아있으므로, 필요할 때 눌러서 동기화한다.
  async function handleSyncDescription(courseId, courseWorkId) {
    setClassroomError('')
    setSyncingFor(courseId)
    try {
      if (!isClassroomConnected()) await signInToClassroom()
      await updateCourseWorkDescription(courseId, courseWorkId, buildCourseWorkDescription(assignmentId))
      window.alert('Classroom에 게시된 설명을 최신 문구로 갱신했습니다.')
    } catch (err) {
      console.error('설명 동기화 실패:', err)
      setClassroomError(getClassroomErrorMessage(err, '설명 동기화'))
    } finally {
      setSyncingFor(null)
    }
  }

  // 이 배정에 걸린 모든 수업의 로스터(이메일·이름)를 불러와 제출자와 매칭한다 — 제출물의
  // studentEmail과 로스터 이메일을 비교해 "이 학생은 어느 반인지"를 알아내고, 명단에 있는데
  // 제출물이 없는 학생은 "미참여"로 표에 따로 보여준다. 로스터를 못 불러온(또는 못 찾은)
  // 제출자는 "매칭 안 됨"으로 남는다.
  async function handleLoadRoster() {
    const classrooms = getAssignmentClassrooms(assignment)
    if (classrooms.length === 0) return
    setClassroomError('')
    setLoadingRoster(true)
    try {
      if (!isClassroomConnected()) await signInToClassroom()
      const map = {}
      for (const c of classrooms) {
        const students = await listCourseStudents(c.courseId)
        for (const s of students) {
          if (s.email) map[s.email] = { courseId: c.courseId, name: s.name }
        }
      }
      const loadedAt = Date.now()
      setRoster(map)
      setRosterLoadedAt(loadedAt)
      writeRosterCache(assignmentId, { roster: map, loadedAt })
    } catch (err) {
      console.error('명단 조회 실패:', err)
      setClassroomError(getClassroomErrorMessage(err, '명단 조회'))
    } finally {
      setLoadingRoster(false)
    }
  }

  const wordLimit = assignment?.wordLimit || passage?.wordLimitGuide || 800
  const classrooms = getAssignmentClassrooms(assignment)
  const hasMultipleClassrooms = classrooms.length > 1
  const totalClassroomStudents = classrooms.length > 0 && classrooms.every(c => classroomCounts[c.courseId]?.count != null)
    ? classrooms.reduce((sum, c) => sum + classroomCounts[c.courseId].count, 0)
    : null

  /** 제출물이 어느 수업 소속인지 — roster를 불러오기 전이면 null(판정 불가). */
  // 명단과 대조할 이메일 — 교사가 직접 연결한 값(rosterEmail)이 로그인 이메일보다 우선한다.
  function matchEmailOf(sub) {
    return (sub.rosterEmail || sub.studentEmail || '').toLowerCase()
  }

  function courseIdForSubmission(sub) {
    if (!roster) return null
    const email = matchEmailOf(sub)
    return email && roster[email] ? roster[email].courseId : UNMATCHED_FILTER
  }

  async function handleLink(sub) {
    if (!linkTarget) return
    setLinking(true)
    try {
      await linkSubmissionToRoster(sub.id, linkTarget.email)
      setSelectedAbsent(prev => prev.filter(e => e !== linkTarget.email))
      setLinkTarget(null)
    } catch (err) {
      console.error('제출물 연결 실패:', err)
      alert('연결 중 오류가 발생했습니다.')
    } finally {
      setLinking(false)
    }
  }

  async function handleUnlink(sub) {
    if (!window.confirm(`${sub.studentName || '이 학생'}의 명단 연결을 해제할까요?`)) return
    await linkSubmissionToRoster(sub.id, null)
  }

  // 명단에는 있는데 이 배정의 제출물이 없는 학생 — 결석 등으로 평가에 안 들어온 학생.
  // 대기실 배정은 평가 시작 전엔 아무도 제출물이 없으므로 시작 후에만 센다.
  const submittedEmails = new Set(submissions.map(matchEmailOf).filter(Boolean))
  const makeupEmails = Array.isArray(assignment?.makeupEmails) ? assignment.makeupEmails : []
  // 추가 응시를 열어 대기실이 초기화된 뒤에도 원래 회차의 미참여 판정은 그대로 보여준다.
  const absenceMeaningful = !assignment?.waitingRoomEnabled || !!assignment?.examStartedAt || makeupEmails.length > 0
  const absentStudents = roster && absenceMeaningful
    ? Object.entries(roster)
      .filter(([email]) => !submittedEmails.has(email))
      .map(([email, info]) => ({ email, ...info }))
      .sort((a, b) => a.courseId.localeCompare(b.courseId) || (a.name || '').localeCompare(b.name || '', 'ko'))
    : []

  const filteredSubmissions = groupFilter === 'all'
    ? submissions
    : groupFilter === ABSENT_FILTER
      ? []
      : submissions.filter(sub => courseIdForSubmission(sub) === groupFilter)
  const filteredAbsent = groupFilter === 'all' || groupFilter === ABSENT_FILTER
    ? absentStudents
    : absentStudents.filter(a => a.courseId === groupFilter)
  const courseNameOf = (courseId) => classrooms.find(c => c.courseId === courseId)?.courseName || ''
  // 반 필터를 골랐으면 상단 "제출 X/Y" 통계도 그 반 기준으로 보여준다.
  // 대기실 단계엔 아직 제출물 문서가 없으므로(평가 시작 후에 만든다) 접속 인원은 presence로 센다.
  const waitingCount = Object.values(presenceMap).filter(p => p?.state && p.state !== 'offline').length
  const submittedCount = filteredSubmissions.filter(s => s.status === 'submitted').length

  const isStructured = assignment?.responseType === 'structured'
  const isGradable = assignment?.responseType === 'essay_calculator'
  // essay_calculator도 structured와 같은 sections 데이터 모양을 쓴다([[EssayWritePage]]의
  // usesSections와 같은 이유) — 대시보드 집계/표시도 둘을 동일하게 취급한다.
  const usesSections = isStructured || isGradable
  // 화면 이탈 감지는 제한시간 평가에서만 켜진다 — 그 전에 쌓인 기록이 있으면 컬럼은 계속 보여준다.
  const focusGuardActive = isFocusGuardActive(assignment)
  const showLeaveColumn = focusGuardActive || submissions.some(s => s.leaveCount > 0)

  function focusSubmissionRow(sub) {
    setGroupFilter('all')
    setHighlightSubId(sub.id)
    setTimeout(() => document.getElementById(`sub-row-${sub.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
    setTimeout(() => setHighlightSubId(h => (h === sub.id ? null : h)), 4000)
  }

  // sections 기반 제출물은 붙여넣기/AI 신호가 섹션별로 쌓이므로(services/essay.js의
  // sections.{id}.* dot-path 증가) 대시보드 표시용으로 섹션들을 합산해서 보여준다.
  function sectionCompletion(sub) {
    const secs = template?.sections || []
    if (!secs.length) return null
    const done = secs.filter(s => htmlToPlainText(sub.sections?.[s.id]?.text || '').trim().length > 0).length
    return { done, total: secs.length }
  }

  // isGradable(essay_calculator) 전용 — 문항 배점 합계, 표에 "X / 총점"으로 보여줄 때 쓴다.
  const totalMaxScore = (template?.sections || []).reduce((sum, s) => sum + (s.maxScore || 0), 0)

  function pastedInfo(sub) {
    if (!usesSections) return { pastedCharTotal: sub.pastedCharTotal || 0 }
    const pastedCharTotal = Object.values(sub.sections || {}).reduce((sum, s) => sum + (s.pastedCharTotal || 0), 0)
    return { pastedCharTotal }
  }

  function aggregatedAiFlags(sub) {
    if (!usesSections) return sub.aiFlags
    const flagsList = Object.values(sub.sections || {}).map(s => s.aiFlags).filter(Boolean)
    if (!flagsList.length) return null
    return {
      score: Math.max(...flagsList.map(f => f.score || 0)),
      phraseMatches: [...new Set(flagsList.flatMap(f => f.phraseMatches || []))],
      markdownHits: flagsList.some(f => f.markdownHits)
    }
  }

  if (accessDenied) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <p className="text-gray-500 mb-4">다른 교사가 만든 배정이라 볼 수 없습니다.</p>
          <button onClick={() => navigate('/admin')} className="text-indigo-600 text-sm underline">돌아가기</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shadow-sm sticky top-0 z-10">
        <button onClick={() => navigate('/admin')} className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-base font-bold text-gray-900">{assignment?.title || '배정'}</h1>
          <p className="text-xs text-gray-500">{passage?.title || (isStructured ? template?.title : '')}</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {assignment?.waitingRoomEnabled && (
            assignment.examStartedAt ? (
              <>
                {assignment.examPausedAt ? (
                  <span className="text-xs bg-slate-200 text-slate-700 rounded-full px-3 py-1 font-medium">⏸ 일시정지 중 (학생은 대기실)</span>
                ) : (
                  <span className="text-xs bg-green-100 text-green-700 rounded-full px-3 py-1 font-medium">
                    평가 진행 중 · {formatClock(assignment.examStartedAt)} 시작
                  </span>
                )}
                {/* 대기실 배정은 모든 학생이 같은 시각(examStartedAt)에 끝나므로 남은 시간을 하나로 보여준다. */}
                {getExamDeadlineMs(assignment, null) != null && (
                  <ExamTimer deadlineMs={getExamDeadlineMs(assignment, null)} serverOffsetMs={serverOffsetMs} pausedAtMs={getPausedAtMs(assignment)} />
                )}
                {assignment.examPausedAt ? (
                  <button
                    onClick={handleResumeExam}
                    className="rounded-lg bg-green-600 px-4 py-1.5 text-xs font-bold text-white transition-colors hover:bg-green-700"
                  >
                    ▶ 평가 재개
                  </button>
                ) : (
                  <button
                    onClick={handlePauseExam}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
                  >
                    ⏸ 일시정지(대기실로)
                  </button>
                )}
              </>
            ) : (
              <>
                <span className="text-xs text-amber-700">대기실 접속 {waitingCount}명</span>
                <button
                  onClick={handleStartExam}
                  disabled={startingExam}
                  className="rounded-lg bg-green-600 px-4 py-1.5 text-xs font-bold text-white transition-colors hover:bg-green-700 disabled:opacity-40"
                >
                  {startingExam ? '시작하는 중...' : '▶ 평가 시작'}
                </button>
              </>
            )
          )}
          <span className="text-xs text-gray-500">제출 {submittedCount} / {filteredSubmissions.length}</span>
          {roster && absenceMeaningful && (
            <span className={`text-xs ${filteredAbsent.length > 0 ? 'font-medium text-orange-600' : 'text-gray-400'}`}>미참여 {filteredAbsent.length}명</span>
          )}
          {isGradable && submissions.length > 0 && (
            <>
              <button
                onClick={() => handleReleaseAll(true)}
                disabled={releasingAll}
                className="rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-50 disabled:opacity-40"
              >
                점수 전체 공개
              </button>
              <button
                onClick={() => handleReleaseAll(false)}
                disabled={releasingAll}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-40"
              >
                전체 비공개
              </button>
            </>
          )}
          {assignment && (
            <button
              onClick={() => navigate(`/admin/assignments/${assignmentId}/edit`)}
              className="rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-50"
            >
              배정 수정
            </button>
          )}
          {assignment && (
            <button
              onClick={handleToggleClosed}
              className={`text-xs rounded-lg px-3 py-1.5 border font-medium transition-colors ${
                assignment.status === 'closed'
                  ? 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  : 'border-red-200 text-red-600 hover:bg-red-50'
              }`}
            >
              {assignment.status === 'closed' ? '마감 해제' : '마감하기'}
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 p-5 max-w-6xl mx-auto w-full">
        {assignment && (
          <section className="mb-5 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
              <p className="text-sm font-bold text-indigo-900">학생용 작성 링크</p>
              <p className="mt-1 break-all font-mono text-xs text-indigo-700">{window.location.origin}/write/{assignmentId}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={handleCopyStudentLink} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700">
                  {copied ? '복사 완료' : '링크 복사'}
                </button>
                <button onClick={() => window.open(`/write/${assignmentId}`, '_blank', 'noopener,noreferrer')} className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-100">
                  학생 화면 열기
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-gray-800">🎓 Google Classroom</p>
                <div className="flex items-center gap-2">
                  {totalClassroomStudents != null && (
                    <span className="text-xs text-gray-500">전체 학생 {totalClassroomStudents}명</span>
                  )}
                  {classrooms.length > 0 && hasClassroomConfig() && (
                    <button
                      onClick={handleCheckClassrooms}
                      disabled={checkingClassrooms}
                      title="Classroom에서 삭제된 과제를 찾아 목록에서 뺍니다"
                      className="rounded-lg border border-gray-200 px-2 py-1 text-[11px] text-gray-500 hover:bg-gray-50 disabled:opacity-40"
                    >
                      {checkingClassrooms ? '확인 중...' : '↻ Classroom과 대조'}
                    </button>
                  )}
                </div>
              </div>

              {/* 이 배정에 걸린 수업들 — 하나였던 예전과 달리 여러 반에 동시 게시될 수 있어서
                  각각 카드로 나열한다(classrooms 배열, essay.js의 getAssignmentClassrooms로
                  예전 단일 classroom 필드도 하위호환으로 배열 취급). */}
              {classrooms.length > 0 && (
                <div className="mb-3 space-y-2">
                  {classrooms.map(c => {
                    const countInfo = classroomCounts[c.courseId]
                    return (
                      <div key={c.courseId} className="rounded-xl border border-gray-100 bg-gray-50 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-bold text-emerald-700">{c.courseName || c.courseId}</p>
                          <div className="flex items-center gap-2">
                            {c.alternateLink && (
                              <a href={c.alternateLink} target="_blank" rel="noreferrer" className="text-xs font-medium text-emerald-700 hover:underline">과제 열기</a>
                            )}
                            <button
                              onClick={() => handleUnlinkClassroom(c.courseId)}
                              title="이 배정의 Classroom 연결 목록에서만 뺍니다(Classroom 과제는 그대로)"
                              className="text-xs text-gray-300 hover:text-red-500"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                        {c.scheduledAt && (
                          <p className="mt-0.5 text-[11px] text-amber-600">
                            ⏰ 예약 게시: {(c.scheduledAt.toDate?.() || new Date(c.scheduledAt)).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            {(c.scheduledAt.toDate?.() || new Date(c.scheduledAt)) > new Date() ? ' (아직 초안)' : ' (공개됨)'}
                          </p>
                        )}
                        <div className="mt-1 flex items-center gap-1 text-[11px] text-gray-500">
                          {countInfo?.count != null ? (
                            <>
                              학생 {countInfo.count}명
                              <button onClick={() => handleFetchStudentCount(c.courseId)} disabled={fetchingCountFor === c.courseId} className="text-gray-400 hover:text-gray-600 disabled:opacity-40">
                                {fetchingCountFor === c.courseId ? '확인 중...' : '↻'}
                              </button>
                              {countInfo.updatedAt && <span className="text-gray-400">({formatTime(countInfo.updatedAt)})</span>}
                            </>
                          ) : (
                            <button onClick={() => handleFetchStudentCount(c.courseId)} disabled={fetchingCountFor === c.courseId} className="text-emerald-700 underline underline-offset-2 hover:text-emerald-800 disabled:opacity-40">
                              {fetchingCountFor === c.courseId ? '확인 중...' : '학생 수 확인'}
                            </button>
                          )}
                          {c.courseWorkId && (
                            <>
                              <span className="text-gray-300">·</span>
                              <button
                                onClick={() => handleSyncDescription(c.courseId, c.courseWorkId)}
                                disabled={syncingFor === c.courseId}
                                title="Classroom에 이미 게시된 설명을 지금 문구로 다시 덮어씁니다"
                                className="text-gray-400 hover:text-gray-600 disabled:opacity-40"
                              >
                                {syncingFor === c.courseId ? '동기화 중...' : '설명 동기화'}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* 명단(이메일·이름)을 불러와 제출자와 매칭한다 — 미참여 학생 표시, 여러 반이면
                  "소속 수업" 필터/컬럼까지 쓸 수 있게 된다. */}
              {classrooms.length > 0 && hasClassroomConfig() && (
                <div className="mb-3">
                  <button
                    onClick={handleLoadRoster}
                    disabled={loadingRoster}
                    className="w-full rounded-xl border border-indigo-200 py-2 text-xs font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-40"
                  >
                    {loadingRoster
                      ? '명단 확인 중...'
                      : `${roster ? '명단 다시 불러오기' : '명단 불러오기'} (미참여 학생${hasMultipleClassrooms ? '·반별 구분' : ''})`}
                  </button>
                  {rosterLoadedAt && (
                    <p className="mt-1 text-[11px] text-gray-400">
                      명단 {Object.keys(roster || {}).length}명 · {formatTime(rosterLoadedAt)} 불러옴 (이 기기에 저장됨)
                    </p>
                  )}
                </div>
              )}

              {!hasClassroomConfig() ? (
                <p className="text-xs text-gray-400">Classroom 설정이 필요합니다.</p>
              ) : !courses ? (
                <button onClick={handleConnectClassroom} disabled={connecting} className="w-full rounded-xl border border-gray-200 py-2.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-40">
                  {connecting ? 'Classroom 연결 중...' : classrooms.length > 0 ? '다른 수업에 추가로 게시' : 'Classroom 연결 후 게시'}
                </button>
              ) : courses.length === 0 ? (
                <p className="text-xs text-gray-400">담당 중인 활성 수업이 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-gray-200 p-2">
                    {courses.map(c => (
                      <label key={c.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedCourseIds.includes(c.id)}
                          onChange={() => toggleCourseSelected(c.id)}
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-300"
                        />
                        {c.name}
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    {[['now', '지금 게시'], ['scheduled', '예약 게시']].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setPublishMode(value)}
                        className={`flex-1 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                          publishMode === value ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {publishMode === 'scheduled' && (
                    <div>
                      <input
                        type="datetime-local"
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        value={scheduledAtStr}
                        min={nowForDatetimeLocal()}
                        onChange={e => setScheduledAtStr(e.target.value)}
                      />
                      <p className="mt-1 text-xs text-gray-400">지정한 시각까지 Classroom에 초안으로만 남아있다가, 그 시각에 자동으로 학생들에게 공개됩니다.</p>
                    </div>
                  )}
                  <button
                    onClick={handlePublishToClassroom}
                    disabled={publishing || selectedCourseIds.length === 0 || (publishMode === 'scheduled' && !scheduledAtStr)}
                    className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-40"
                  >
                    {publishing
                      ? '게시 중...'
                      : `선택한 ${selectedCourseIds.length}개 수업에 ${publishMode === 'scheduled' ? '예약 게시' : '과제로 게시'}`}
                  </button>
                </div>
              )}
              {classroomError && <p className="mt-2 text-xs text-red-500">{classroomError}</p>}
            </div>
          </section>
        )}

        {makeupEmails.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3">
            <p className="text-sm text-orange-800">
              <span className="font-bold">🔁 추가 응시 {assignment.status === 'closed' ? '(마감됨)' : '진행 중'}</span>
              {' '}— 대상 {makeupEmails.length}명만 응시 가능:{' '}
              <span className="text-orange-700">{makeupEmails.map(email => roster?.[email]?.name || email).join(', ')}</span>
            </p>
            <button
              onClick={handleClearMakeup}
              className="ml-auto rounded-lg border border-orange-300 bg-white px-3 py-1.5 text-xs font-medium text-orange-700 hover:bg-orange-100"
            >
              대상 제한 해제
            </button>
          </div>
        )}

        {filteredAbsent.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            <button
              onClick={() => setSelectedAbsent(prev => (
                filteredAbsent.every(a => prev.includes(a.email))
                  ? prev.filter(e => !filteredAbsent.some(a => a.email === e))
                  : [...new Set([...prev, ...filteredAbsent.map(a => a.email)])]
              ))}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-600 hover:bg-gray-50"
            >
              {filteredAbsent.every(a => selectedAbsent.includes(a.email)) ? '미참여 선택 해제' : '미참여 전체 선택'}
            </button>
            <button
              onClick={handleOpenMakeup}
              disabled={selectedAbsent.length === 0 || openingMakeup}
              className="rounded-lg bg-orange-500 px-3 py-1.5 font-bold text-white hover:bg-orange-600 disabled:opacity-40"
            >
              {openingMakeup ? '여는 중...' : `선택한 ${selectedAbsent.length}명 추가 응시 열기`}
            </button>
            <span className="text-gray-400">고른 학생만 들어올 수 있게 마감을 해제합니다.</span>
          </div>
        )}

        {(hasMultipleClassrooms || (roster && absenceMeaningful)) && (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {[
              { value: 'all', label: `전체 (${submissions.length + absentStudents.length})` },
              ...(hasMultipleClassrooms ? [
                ...classrooms.map(c => ({
                  value: c.courseId,
                  label: `${c.courseName || c.courseId} (${roster ? submissions.filter(s => courseIdForSubmission(s) === c.courseId).length + absentStudents.filter(a => a.courseId === c.courseId).length : '?'})`
                })),
                { value: UNMATCHED_FILTER, label: `매칭 안 됨 (${roster ? submissions.filter(s => courseIdForSubmission(s) === UNMATCHED_FILTER).length : '?'})` }
              ] : []),
              ...(roster && absenceMeaningful ? [{ value: ABSENT_FILTER, label: `미참여 (${absentStudents.length})` }] : [])
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setGroupFilter(opt.value)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  groupFilter === opt.value ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : submissions.length === 0 && absentStudents.length === 0 ? (
          <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-gray-200">
            아직 시작한 학생이 없습니다.
          </div>
        ) : filteredSubmissions.length === 0 && filteredAbsent.length === 0 ? (
          <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-gray-200">
            이 조건에 해당하는 학생이 없습니다.
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
                  <th className="px-4 py-3 font-medium">이름 / 학급</th>
                  {hasMultipleClassrooms && <th className="px-4 py-3 font-medium">소속 수업</th>}
                  <th className="px-4 py-3 font-medium">상태</th>
                  <th className="px-4 py-3 font-medium">접속</th>
                  {showLeaveColumn && <th className="px-4 py-3 font-medium">화면 이탈</th>}
                  <th className="px-4 py-3 font-medium">{usesSections ? '완료 섹션' : '글자수'}</th>
                  {isGradable && <th className="px-4 py-3 font-medium">점수</th>}
                  <th className="px-4 py-3 font-medium">마지막 저장</th>
                  <th className="px-4 py-3 font-medium">붙여넣기 비율</th>
                  <th className="px-4 py-3 font-medium">AI 의심 신호</th>
                  <th className="px-4 py-3 font-medium">제출 시각</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {filteredSubmissions.map(sub => {
                  const { pastedCharTotal } = pastedInfo(sub)
                  const pasteRatio = sub.charCount > 0 ? Math.round((pastedCharTotal / sub.charCount) * 100) : 0
                  const completion = usesSections ? sectionCompletion(sub) : null
                  const subCourseId = hasMultipleClassrooms ? courseIdForSubmission(sub) : null
                  const subCourseName = subCourseId && subCourseId !== UNMATCHED_FILTER
                    ? courseNameOf(subCourseId)
                    : null
                  const rosterEntry = roster?.[matchEmailOf(sub)]
                  const loginEmail = (sub.studentEmail || '').toLowerCase()
                  return (
                    <tr
                      key={sub.id}
                      id={`sub-row-${sub.id}`}
                      className={`border-b border-gray-50 last:border-0 cursor-pointer transition-colors ${highlightSubId === sub.id ? 'bg-red-50' : 'hover:bg-gray-50'}`}
                      onClick={() => navigate(`/admin/assignments/${assignmentId}/student/${sub.studentUid}`)}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800">
                          {sub.studentName || rosterEntry?.name || '(이름 없음)'}
                          {memos[sub.id] && (
                            <span className="ml-1 cursor-help" title={memos[sub.id]}>📝</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-400">
                          {sub.studentClass ? `${sub.studentClass}반` : (!hasMultipleClassrooms && rosterEntry ? courseNameOf(rosterEntry.courseId) : '')}
                        </p>
                        {/* 어느 계정으로 로그인했는지 — 명단과 다른 계정이면 여기서 바로 보인다. */}
                        <p className="text-[11px] text-gray-400 break-all">
                          {loginEmail || '(이메일 없음)'}
                          {roster && !rosterEntry && (
                            <span className="ml-1 rounded bg-amber-100 px-1 text-amber-700">명단에 없음</span>
                          )}
                        </p>
                        {sub.rosterEmail && (
                          <p className="text-[11px] text-indigo-500">
                            🔗 {rosterEntry?.name || sub.rosterEmail} 으로 연결됨
                            <button
                              onClick={(e) => { e.stopPropagation(); handleUnlink(sub) }}
                              className="ml-1 text-gray-400 underline hover:text-red-500"
                            >
                              해제
                            </button>
                          </p>
                        )}
                      </td>
                      {hasMultipleClassrooms && (
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {roster ? (subCourseName || '매칭 안 됨') : '—'}
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                          sub.status === 'submitted'
                          ? (sub.forceSubmitted ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700')
                          : 'bg-gray-100 text-gray-500'
                        }`}>
                          {sub.status === 'submitted'
                            ? (sub.forceSubmitted ? '강제 제출' : sub.autoSubmitted ? '시간종료 제출' : '제출완료')
                            : '작성중'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {sub.status === 'submitted' ? (
                          <span className="text-xs text-gray-300">—</span>
                        ) : (
                          <PresenceBadge state={presenceMap[sub.studentUid]?.state} />
                        )}
                      </td>
                      {showLeaveColumn && (
                        <td className="px-4 py-3 text-xs">
                          {sub.leaveCount > 0 ? (
                            <span className="font-medium text-red-600" title={sub.lastLeftAt ? `마지막 이탈: ${formatClock(sub.lastLeftAt)}` : ''}>
                              ⚠ {sub.leaveCount}회{sub.leaveTotalMs ? ` · ${formatDuration(sub.leaveTotalMs)}` : ''}
                            </span>
                          ) : (
                            <span className="text-gray-300">0회</span>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3 text-gray-600">
                        {usesSections
                          ? (completion ? `${completion.done} / ${completion.total}` : '—')
                          : `${sub.charCount} / ${wordLimit}`}
                      </td>
                      {isGradable && (
                        <td className="px-4 py-3 text-xs">
                          {sub.totalScore != null ? (
                            <span className="font-medium text-gray-700">
                              {sub.totalScore}{totalMaxScore > 0 ? ` / ${totalMaxScore}` : ''}
                              {sub.scoreReleased && <span className="ml-1 text-green-600" title="학생에게 공개됨">🔓</span>}
                            </span>
                          ) : (
                            <span className="text-gray-300">채점 전</span>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3 text-gray-400 text-xs">{formatTime(sub.lastSavedAt)}</td>
                      <td className={`px-4 py-3 text-xs font-medium ${pasteRatio >= 30 ? 'text-red-600' : 'text-gray-500'}`}>
                        {pasteRatio}% ({pastedCharTotal}자)
                      </td>
                      <td className="px-4 py-3"><AiFlagBadge aiFlags={aggregatedAiFlags(sub)} /></td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{sub.submittedAt ? formatTime(sub.submittedAt) : '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <button
                            onClick={(e) => { e.stopPropagation(); openMemo(sub) }}
                            className="text-xs text-gray-400 hover:text-indigo-600"
                          >
                            메모
                          </button>
                          {sub.status === 'submitted' ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleReopen(sub) }}
                              className="text-xs text-gray-400 hover:text-indigo-600"
                            >
                              재열기
                            </button>
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleForceSubmit(sub) }}
                              className="rounded border border-red-200 px-1.5 py-0.5 text-xs text-red-500 hover:bg-red-50"
                            >
                              강제 제출
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {filteredAbsent.map(a => (
                  <tr
                    key={`absent-${a.email}`}
                    className="border-b border-gray-50 last:border-0 bg-orange-50/40 cursor-pointer"
                    onClick={() => toggleAbsentSelected(a.email)}
                  >
                    <td className="px-4 py-3">
                      <label className="flex items-start gap-2 cursor-pointer" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedAbsent.includes(a.email)}
                          onChange={() => toggleAbsentSelected(a.email)}
                          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-orange-500 focus:ring-orange-300"
                        />
                        <span>
                          <span className="block font-medium text-gray-500">{a.name || a.email}</span>
                          <span className="block text-xs text-gray-400">{hasMultipleClassrooms ? a.email : courseNameOf(a.courseId)}</span>
                        </span>
                      </label>
                    </td>
                    {hasMultipleClassrooms && <td className="px-4 py-3 text-xs text-gray-500">{courseNameOf(a.courseId)}</td>}
                    <td className="px-4 py-3">
                      <span className="text-xs rounded-full px-2 py-0.5 font-medium bg-orange-100 text-orange-700">미참여</span>
                      {makeupEmails.includes(a.email) && (
                        <span className="ml-1 text-xs rounded-full px-2 py-0.5 font-medium bg-white border border-orange-300 text-orange-700">추가 응시 대상</span>
                      )}
                    </td>
                    <td colSpan={99} className="px-4 py-3 text-xs">
                      <button
                        onClick={(e) => { e.stopPropagation(); setLinkTarget(a) }}
                        className="rounded border border-indigo-200 bg-white px-2 py-0.5 text-indigo-600 hover:bg-indigo-50"
                        title="다른 계정으로 로그인해 제출한 경우, 그 제출물을 이 학생으로 연결합니다"
                      >
                        🔗 제출물과 연결
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {focusGuardActive && <LeaveAlerts submissions={submissions} onSelect={focusSubmissionRow} />}

      {linkTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4"
          onMouseDown={e => { if (e.target === e.currentTarget) setLinkTarget(null) }}
        >
          <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl bg-white p-5 shadow-2xl" role="dialog" aria-modal="true">
            <p className="text-sm font-bold text-gray-900">{linkTarget.name || linkTarget.email} — 제출물과 연결</p>
            <p className="mt-0.5 text-xs text-gray-400">
              명단 계정: {linkTarget.email}{linkTarget.courseId ? ` · ${courseNameOf(linkTarget.courseId)}` : ''}
              <br />이 학생이 다른 계정으로 로그인해 제출했다면 그 제출물을 고르세요. 명단과 연결되지 않은 제출물만 보입니다.
            </p>
            <div className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto">
              {submissions.filter(s => !roster?.[matchEmailOf(s)]).length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-400">연결할 수 있는 제출물이 없습니다.</p>
              ) : (
                submissions.filter(s => !roster?.[matchEmailOf(s)]).map(s => (
                  <button
                    key={s.id}
                    onClick={() => handleLink(s)}
                    disabled={linking}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-200 px-3 py-2 text-left hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-40"
                  >
                    <span>
                      <span className="block text-sm font-medium text-gray-800">
                        {s.studentName || '(이름 없음)'}{s.studentClass ? ` · ${s.studentClass}반` : ''}
                      </span>
                      <span className="block text-[11px] text-gray-400 break-all">{s.studentEmail || '(이메일 없음)'}</span>
                    </span>
                    <span className="shrink-0 text-xs text-gray-500">
                      {s.status === 'submitted' ? '제출완료' : '작성중'}
                    </span>
                  </button>
                ))
              )}
            </div>
            <div className="mt-3 flex justify-end">
              <button onClick={() => setLinkTarget(null)} className="px-3 py-2 text-sm text-gray-500">닫기</button>
            </div>
          </div>
        </div>
      )}

      {memoTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4"
          onMouseDown={e => { if (e.target === e.currentTarget) setMemoTarget(null) }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" role="dialog" aria-modal="true">
            <p className="text-sm font-bold text-gray-900">{memoTarget.studentName || '(이름 없음)'} — 교사 메모</p>
            <p className="mt-0.5 text-xs text-gray-400">학생에게는 보이지 않습니다.</p>
            <textarea
              className="mt-3 w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              rows={6}
              value={memoDraft}
              onChange={e => setMemoDraft(e.target.value)}
              placeholder="예: 10:25 휴대폰으로 답안 검색하는 것 목격"
              autoFocus
            />
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setMemoTarget(null)} className="px-3 py-2 text-sm text-gray-500">취소</button>
              <button
                onClick={handleSaveMemo}
                disabled={savingMemo}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
              >
                {savingMemo ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
