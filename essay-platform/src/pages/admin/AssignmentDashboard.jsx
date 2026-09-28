import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ref, onValue } from 'firebase/database'
import { useAuth } from '../../App.jsx'
import { getAssignment, getPassage, subscribeSubmissions, reopenSubmission, updateAssignment, releaseScores, getAssignmentClassrooms, startExam, resetExamStart } from '../../services/essay.js'
import { getTemplate } from '../../services/reportTemplates.js'
import { rtdb } from '../../firebase.js'
import AiFlagBadge from '../../components/AiFlagBadge.jsx'
import PresenceBadge from '../../components/PresenceBadge.jsx'
import { htmlToPlainText } from '../../utils/richText.js'
import { nowForDatetimeLocal } from '../../utils/datetimeLocal.js'
import { hasClassroomConfig, signInToClassroom, listMyCourses, createCourseWork, updateCourseWorkDescription, courseWorkExists, getClassroomErrorMessage, getCourseStudentCount, listCourseStudents, isClassroomConnected } from '../../services/classroom.js'

/** handlePublishToClassroom과 반드시 같은 문구를 써야 한다 — "설명 동기화" 버튼이
 * 이미 게시된 과제를 이 문구로 덮어쓰기 때문. */
function buildCourseWorkDescription(assignmentId) {
  const linkUrl = `${window.location.origin}/write/${assignmentId}`
  return `서술형 수행평가입니다. 아래 링크에서 지문을 읽고 답안을 작성해주세요.\n${linkUrl}`
}

// 필터 탭에서 "명단에서 못 찾은 학생"을 고르는 값 — 실제 courseId와 절대 안 겹치게 접두사를 둠.
const UNMATCHED_FILTER = '__unmatched__'

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
  const [roster, setRoster] = useState(null) // null: 아직 안 불러옴, {}: 불러왔지만 빈 수업들
  const [loadingRoster, setLoadingRoster] = useState(false)
  const [groupFilter, setGroupFilter] = useState('all') // 'all' | courseId | UNMATCHED_FILTER

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

  async function handleResetExamStart() {
    if (!window.confirm('대기실로 되돌릴까요? 이미 문항을 받은 학생 화면은 그대로이고, 새로 접속하는 학생만 다시 대기실을 보게 됩니다.')) return
    await resetExamStart(assignmentId)
    setAssignment(a => ({ ...a, examStartedAt: null }))
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

  // 이 배정에 걸린 모든 수업의 로스터(이메일)를 불러와 제출자와 매칭한다 — 제출물의
  // studentEmail과 로스터 이메일을 비교해 "이 학생은 어느 반인지"를 알아낸다. 로스터를
  // 못 불러온(또는 못 찾은) 학생은 "매칭 안 됨"으로 남는다.
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
          if (s.email) map[s.email] = c.courseId
        }
      }
      setRoster(map)
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
  function courseIdForSubmission(sub) {
    if (!roster) return null
    const email = (sub.studentEmail || '').toLowerCase()
    return email && roster[email] ? roster[email] : UNMATCHED_FILTER
  }

  const filteredSubmissions = groupFilter === 'all'
    ? submissions
    : submissions.filter(sub => courseIdForSubmission(sub) === groupFilter)
  // 반 필터를 골랐으면 상단 "제출 X/Y" 통계도 그 반 기준으로 보여준다.
  // 대기실 단계엔 아직 제출물 문서가 없으므로(평가 시작 후에 만든다) 접속 인원은 presence로 센다.
  const waitingCount = Object.values(presenceMap).filter(p => p?.state && p.state !== 'offline').length
  const submittedCount = filteredSubmissions.filter(s => s.status === 'submitted').length

  const isStructured = assignment?.responseType === 'structured'
  const isGradable = assignment?.responseType === 'essay_calculator'
  // essay_calculator도 structured와 같은 sections 데이터 모양을 쓴다([[EssayWritePage]]의
  // usesSections와 같은 이유) — 대시보드 집계/표시도 둘을 동일하게 취급한다.
  const usesSections = isStructured || isGradable

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
                <span className="text-xs bg-green-100 text-green-700 rounded-full px-3 py-1 font-medium">
                  평가 진행 중 · {formatClock(assignment.examStartedAt)} 시작
                </span>
                <button onClick={handleResetExamStart} className="text-xs text-gray-400 underline hover:text-gray-600">
                  대기실로 되돌리기
                </button>
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

              {/* 여러 반에 걸쳐 있을 때만 의미가 있다 — 명단(이메일)을 불러와 제출자와
                  매칭해서 아래 표에 "소속 수업" 필터/컬럼을 쓸 수 있게 한다. */}
              {classrooms.length > 1 && (
                <button
                  onClick={handleLoadRoster}
                  disabled={loadingRoster}
                  className="mb-3 w-full rounded-xl border border-indigo-200 py-2 text-xs font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-40"
                >
                  {loadingRoster ? '명단 확인 중...' : roster ? '명단 다시 불러오기 (반별로 나눠보기)' : '명단 불러오기 (반별로 나눠보기)'}
                </button>
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

        {hasMultipleClassrooms && (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {[
              { value: 'all', label: `전체 (${submissions.length})` },
              ...classrooms.map(c => ({
                value: c.courseId,
                label: `${c.courseName || c.courseId} (${roster ? submissions.filter(s => courseIdForSubmission(s) === c.courseId).length : '?'})`
              })),
              { value: UNMATCHED_FILTER, label: `매칭 안 됨 (${roster ? submissions.filter(s => courseIdForSubmission(s) === UNMATCHED_FILTER).length : '?'})` }
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
        ) : submissions.length === 0 ? (
          <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-gray-200">
            아직 시작한 학생이 없습니다.
          </div>
        ) : filteredSubmissions.length === 0 ? (
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
                    ? classrooms.find(c => c.courseId === subCourseId)?.courseName
                    : null
                  return (
                    <tr
                      key={sub.id}
                      className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer"
                      onClick={() => navigate(`/admin/assignments/${assignmentId}/student/${sub.studentUid}`)}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800">{sub.studentName || '(이름 없음)'}</p>
                        <p className="text-xs text-gray-400">{sub.studentClass ? `${sub.studentClass}반` : ''}</p>
                      </td>
                      {hasMultipleClassrooms && (
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {roster ? (subCourseName || '매칭 안 됨') : '—'}
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                          sub.status === 'submitted' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {sub.status === 'submitted' ? '제출완료' : '작성중'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {sub.status === 'submitted' ? (
                          <span className="text-xs text-gray-300">—</span>
                        ) : (
                          <PresenceBadge state={presenceMap[sub.studentUid]?.state} />
                        )}
                      </td>
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
                        {sub.status === 'submitted' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleReopen(sub) }}
                            className="text-xs text-gray-400 hover:text-indigo-600"
                          >
                            재열기
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
