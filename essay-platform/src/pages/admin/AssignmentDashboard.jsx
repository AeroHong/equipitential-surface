import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../App.jsx'
import { getAssignment, getPassage, subscribeSubmissions, reopenSubmission, updateAssignment } from '../../services/essay.js'
import { getTemplate } from '../../services/reportTemplates.js'
import AiFlagBadge from '../../components/AiFlagBadge.jsx'
import { htmlToPlainText } from '../../utils/richText.js'
import { hasClassroomConfig, signInToClassroom, listMyCourses, createCourseWork, getClassroomErrorMessage, getCourseStudentCount, isClassroomConnected } from '../../services/classroom.js'

function formatTime(ts) {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  const diff = Math.floor((Date.now() - d) / 1000)
  if (diff < 60) return `${diff}초 전`
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
  return d.toLocaleDateString('ko-KR')
}

export default function AssignmentDashboard() {
  const { assignmentId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [assignment, setAssignment] = useState(null)
  const [passage, setPassage] = useState(null)
  const [template, setTemplate] = useState(null)
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)
  const [copied, setCopied] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [courses, setCourses] = useState(null)
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [classroomError, setClassroomError] = useState('')
  const [classroomStudentCount, setClassroomStudentCount] = useState(null)
  const [fetchingStudentCount, setFetchingStudentCount] = useState(false)

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
      if (a?.classroom?.studentCount != null) setClassroomStudentCount(a.classroom.studentCount)
      if (a?.passageId) setPassage(await getPassage(a.passageId))
      if (a?.responseType === 'structured' && a.templateId) setTemplate(await getTemplate(a.templateId))
      unsub = subscribeSubmissions(assignmentId, data => { setSubmissions(data); setLoading(false) }, user.uid)
    })
    return () => unsub()
  }, [assignmentId, user])

  async function handleReopen(sub) {
    if (!window.confirm(`${sub.studentName} 학생의 제출을 다시 열까요? 학생이 재수정할 수 있게 됩니다.`)) return
    await reopenSubmission(sub.id)
  }

  async function handleToggleClosed() {
    if (!assignment) return
    const nextStatus = assignment.status === 'closed' ? 'open' : 'closed'
    await updateAssignment(assignmentId, { status: nextStatus })
    setAssignment(a => ({ ...a, status: nextStatus }))
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

  async function handleConnectClassroom() {
    setClassroomError('')
    setConnecting(true)
    try {
      await signInToClassroom()
      const list = await listMyCourses()
      setCourses(list)
      if (list.length) setSelectedCourseId(list[0].id)
    } catch (err) {
      console.error('Classroom 연결 실패:', err)
      setClassroomError(getClassroomErrorMessage(err))
    } finally {
      setConnecting(false)
    }
  }

  // 클래스룸 학생 수는 토큰이 있어야 조회되는데, 토큰은 페이지를 새로 열 때마다 초기화된다
  // (services/classroom.js는 모듈 메모리에만 토큰을 들고 있음, 새로고침 시 사라짐). 이미
  // 연결돼 있으면 그대로 조회하고, 아니면 조용히(팝업 없이) 먼저 연결부터 시도한다.
  async function handleFetchStudentCount() {
    if (!assignment?.classroom?.courseId) return
    setClassroomError('')
    setFetchingStudentCount(true)
    try {
      if (!isClassroomConnected()) await signInToClassroom()
      const count = await getCourseStudentCount(assignment.classroom.courseId)
      setClassroomStudentCount(count)
      const studentCountUpdatedAt = new Date()
      const nextClassroom = { ...assignment.classroom, studentCount: count, studentCountUpdatedAt }
      await updateAssignment(assignmentId, { classroom: nextClassroom })
      setAssignment(a => ({ ...a, classroom: nextClassroom }))
    } catch (err) {
      console.error('클래스룸 학생 수 조회 실패:', err)
      setClassroomError(getClassroomErrorMessage(err, '학생 수 조회'))
    } finally {
      setFetchingStudentCount(false)
    }
  }

  async function handlePublishToClassroom() {
    if (!assignment || !selectedCourseId) return
    setPublishing(true)
    setClassroomError('')
    try {
      const course = courses.find(c => c.id === selectedCourseId)
      const linkUrl = `${window.location.origin}/write/${assignmentId}`
      const dueDate = assignment.dueAt?.toDate?.() || undefined
      const result = await createCourseWork(selectedCourseId, {
        title: assignment.title,
        description: `물리학Ⅱ 서술형 수행평가입니다. 아래 링크에서 지문을 읽고 답안을 작성해주세요.\n${linkUrl}`,
        linkUrl,
        dueDate
      })
      const classroom = {
        courseId: selectedCourseId,
        courseWorkId: result.id,
        courseName: course?.name || '',
        alternateLink: result.alternateLink || '',
        postedAt: new Date()
      }
      await updateAssignment(assignmentId, { classroom })
      setAssignment(a => ({ ...a, classroom }))
      setCourses(null)
    } catch (err) {
      console.error('Classroom 게시 실패:', err)
      setClassroomError(getClassroomErrorMessage(err, '게시'))
    } finally {
      setPublishing(false)
    }
  }

  const wordLimit = assignment?.wordLimit || passage?.wordLimitGuide || 800
  const submittedCount = submissions.filter(s => s.status === 'submitted').length
  const isStructured = assignment?.responseType === 'structured'

  // structured 제출물은 붙여넣기/AI 신호가 섹션별로 쌓이므로(services/essay.js의
  // sections.{id}.* dot-path 증가) 대시보드 표시용으로 섹션들을 합산해서 보여준다.
  function sectionCompletion(sub) {
    const secs = template?.sections || []
    if (!secs.length) return null
    const done = secs.filter(s => htmlToPlainText(sub.sections?.[s.id]?.text || '').trim().length > 0).length
    return { done, total: secs.length }
  }

  function pastedInfo(sub) {
    if (!isStructured) return { pastedCharTotal: sub.pastedCharTotal || 0 }
    const pastedCharTotal = Object.values(sub.sections || {}).reduce((sum, s) => sum + (s.pastedCharTotal || 0), 0)
    return { pastedCharTotal }
  }

  function aggregatedAiFlags(sub) {
    if (!isStructured) return sub.aiFlags
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
          <span className="text-xs text-gray-500">제출 {submittedCount} / {submissions.length}</span>
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
                {assignment.classroom?.alternateLink && (
                  <a href={assignment.classroom.alternateLink} target="_blank" rel="noreferrer" className="text-xs font-medium text-emerald-700 hover:underline">게시된 과제 열기</a>
                )}
              </div>
              {assignment.classroom?.courseName && <p className="mb-1 text-xs text-emerald-700">현재 게시 수업: {assignment.classroom.courseName}</p>}
              {assignment.classroom?.courseId && (
                <div className="mb-3 flex items-center gap-2">
                  {classroomStudentCount === null ? (
                    <button
                      onClick={handleFetchStudentCount}
                      disabled={fetchingStudentCount}
                      className="text-xs text-emerald-700 underline underline-offset-2 hover:text-emerald-800 disabled:opacity-40"
                    >
                      {fetchingStudentCount ? '학생 수 확인 중...' : '클래스룸 학생 수 확인'}
                    </button>
                  ) : (
                    <p className="text-xs text-gray-600">
                      클래스룸 학생 <span className="font-bold text-gray-800">{classroomStudentCount}명</span> · 제출완료 <span className="font-bold text-gray-800">{submittedCount}명</span>
                      <button onClick={handleFetchStudentCount} disabled={fetchingStudentCount} className="ml-2 text-gray-400 hover:text-gray-600 disabled:opacity-40">
                        {fetchingStudentCount ? '확인 중...' : '↻'}
                      </button>
                      {assignment.classroom?.studentCountUpdatedAt && (
                        <span className="ml-1 text-gray-400">({formatTime(assignment.classroom.studentCountUpdatedAt)} 확인)</span>
                      )}
                    </p>
                  )}
                </div>
              )}
              {!hasClassroomConfig() ? (
                <p className="text-xs text-gray-400">Classroom 설정이 필요합니다.</p>
              ) : !courses ? (
                <button onClick={handleConnectClassroom} disabled={connecting} className="w-full rounded-xl border border-gray-200 py-2.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-40">
                  {connecting ? 'Classroom 연결 중...' : assignment.classroom ? '다른 수업에 다시 게시' : 'Classroom 연결 후 게시'}
                </button>
              ) : courses.length === 0 ? (
                <p className="text-xs text-gray-400">담당 중인 활성 수업이 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  <select className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" value={selectedCourseId} onChange={e => setSelectedCourseId(e.target.value)}>
                    {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button onClick={handlePublishToClassroom} disabled={publishing} className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-40">
                    {publishing ? '게시 중...' : '선택한 수업에 과제로 게시'}
                  </button>
                </div>
              )}
              {classroomError && <p className="mt-2 text-xs text-red-500">{classroomError}</p>}
            </div>
          </section>
        )}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : submissions.length === 0 ? (
          <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-gray-200">
            아직 시작한 학생이 없습니다.
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
                  <th className="px-4 py-3 font-medium">이름 / 학급</th>
                  <th className="px-4 py-3 font-medium">상태</th>
                  <th className="px-4 py-3 font-medium">{isStructured ? '완료 섹션' : '글자수'}</th>
                  <th className="px-4 py-3 font-medium">마지막 저장</th>
                  <th className="px-4 py-3 font-medium">붙여넣기 비율</th>
                  <th className="px-4 py-3 font-medium">AI 의심 신호</th>
                  <th className="px-4 py-3 font-medium">제출 시각</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {submissions.map(sub => {
                  const { pastedCharTotal } = pastedInfo(sub)
                  const pasteRatio = sub.charCount > 0 ? Math.round((pastedCharTotal / sub.charCount) * 100) : 0
                  const completion = isStructured ? sectionCompletion(sub) : null
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
                      <td className="px-4 py-3">
                        <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                          sub.status === 'submitted' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {sub.status === 'submitted' ? '제출완료' : '작성중'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {isStructured
                          ? (completion ? `${completion.done} / ${completion.total}` : '—')
                          : `${sub.charCount} / ${wordLimit}`}
                      </td>
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
