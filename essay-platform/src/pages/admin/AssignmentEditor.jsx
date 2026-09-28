import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../App.jsx'
import { listPassages, getAssignment, createAssignment, updateAssignment } from '../../services/essay.js'
import { listTemplates, getTemplateKind, TEMPLATE_KIND_QUESTION_SET } from '../../services/reportTemplates.js'
import { hasClassroomConfig, signInToClassroom, listMyCourses, createCourseWork, getClassroomErrorMessage } from '../../services/classroom.js'
import { nowForDatetimeLocal } from '../../utils/datetimeLocal.js'

/** <input type="datetime-local">의 min 속성용 — 지금 이 순간을 로컬 시간대 "YYYY-MM-DDTHH:mm"로. */
export default function AssignmentEditor() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { assignmentId } = useParams()
  const isEdit = Boolean(assignmentId)
  const [responseType, setResponseType] = useState('essay')
  const [calculatorEnabled, setCalculatorEnabled] = useState(false)
  const [waitingRoomEnabled, setWaitingRoomEnabled] = useState(false)
  const [passages, setPassages] = useState([])
  const [passageId, setPassageId] = useState('')
  const [templates, setTemplates] = useState([])
  const [templateId, setTemplateId] = useState('')
  const [title, setTitle] = useState('')
  const [dueAtStr, setDueAtStr] = useState('')
  const [wordLimit, setWordLimit] = useState('')
  const [status, setStatus] = useState('open')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(isEdit)
  const [accessDenied, setAccessDenied] = useState(false)

  // Classroom 연동 상태 — 배정 저장 "후"가 아니라 만드는 화면에서 바로 설정한다. 이렇게 해야
  // 예약 게시(state: DRAFT + scheduledTime)를 배정 생성과 한 번에 할 수 있다 — 저장부터 하고
  // 나중에 따로 게시하면 "지금 게시"만 가능하고 예약은 애초에 걸 수 없다.
  const [classroomEnabled, setClassroomEnabled] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [courses, setCourses] = useState(null)
  // 여러 수업(반)에 동시 게시할 수 있게 체크박스 다중 선택으로 관리한다.
  const [selectedCourseIds, setSelectedCourseIds] = useState([])
  const [publishMode, setPublishMode] = useState('now') // 'now' | 'scheduled'
  const [scheduledAtStr, setScheduledAtStr] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [classroomError, setClassroomError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const [passageList, templateList, assignment] = await Promise.all([
          listPassages(user.uid),
          listTemplates(user.uid),
          isEdit ? getAssignment(assignmentId) : Promise.resolve(null)
        ])
        // 본인이 만든 배정만 수정할 수 있다 — URL을 직접 알아도 남의 배정은 열리지 않게
        // 화면에서도 막는다(저장 시도 시 firestore.rules가 어차피 막지만, 편집 가능한 것처럼
        // 보이다 저장에서만 실패하는 건 혼란스럽다).
        if (assignment && assignment.createdBy !== user.uid) {
          setAccessDenied(true)
          return
        }
        const availablePassages = isEdit ? passageList : passageList.filter(p => p.active)
        const availableTemplates = isEdit ? templateList : templateList.filter(t => t.active)
        setPassages(availablePassages)
        setTemplates(availableTemplates)
        if (assignment) {
          const dueDate = assignment.dueAt?.toDate?.() || null
          setResponseType(assignment.responseType || 'essay')
          setCalculatorEnabled(!!assignment.calculatorEnabled)
          setWaitingRoomEnabled(!!assignment.waitingRoomEnabled)
          setPassageId(assignment.passageId || '')
          setTemplateId(assignment.templateId || '')
          setTitle(assignment.title || '')
          setDueAtStr(dueDate ? [dueDate.getFullYear(), String(dueDate.getMonth() + 1).padStart(2, '0'), String(dueDate.getDate()).padStart(2, '0')].join('-') : '')
          setWordLimit(assignment.wordLimit ?? '')
          setStatus(assignment.status || 'open')
        } else if (!isEdit) {
          if (availablePassages.length) setPassageId(availablePassages[0].id)
          if (availableTemplates.length) setTemplateId(availableTemplates[0].id)
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [assignmentId, isEdit, user])

  async function handleConnectClassroom() {
    setClassroomError('')
    setConnecting(true)
    try {
      await signInToClassroom()
      const list = await listMyCourses()
      setCourses(list)
      if (list.length) setSelectedCourseIds([list[0].id])
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

  // essay_calculator("서술형 평가-문항")는 structured와 같은 양식(문항별 답변)을 쓰고,
  // 지문도 structured와 마찬가지로 선택 사항이다(참고 자료가 필요 없는 문항도 있음) —
  // "구조화된 보고서 + 계산기"에 더 가깝다. essay(자유서술 한 칸)만 지문이 필수다.
  const usesTemplate = responseType === 'structured' || responseType === 'essay_calculator'

  // 새 배정에서 유형을 바꾸면 그 유형에 맞는 종류의 양식을 기본 선택해준다 — 서술형 평가-문항은
  // 문항 세트, 구조화된 보고서는 보고서 양식(해당 종류가 하나도 없으면 선택은 그대로 둔다).
  function handleResponseTypeChange(value) {
    setResponseType(value)
    const preferredKind = value === 'essay_calculator' ? TEMPLATE_KIND_QUESTION_SET : 'report'
    const current = templates.find(t => t.id === templateId)
    if (current && getTemplateKind(current) === preferredKind) return
    const preferred = templates.find(t => getTemplateKind(t) === preferredKind)
    if (preferred) setTemplateId(preferred.id)
  }

  async function handleSave() {
    if (responseType === 'essay' && !passageId) { alert('지문을 선택해주세요.'); return }
    if (usesTemplate && !templateId) { alert('양식 또는 문항 세트를 선택해주세요.'); return }
    if (!title.trim()) { alert('배정 제목을 입력해주세요.'); return }
    if (!isEdit && classroomEnabled) {
      if (selectedCourseIds.length === 0) { alert('게시할 Classroom 수업을 하나 이상 선택해주세요.'); return }
      if (publishMode === 'scheduled' && !scheduledAtStr) { alert('예약 게시 시각을 입력해주세요.'); return }
    }
    let scheduledAt = null
    if (!isEdit && classroomEnabled && publishMode === 'scheduled') {
      scheduledAt = new Date(scheduledAtStr)
      if (Number.isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) {
        alert('예약 시각은 지금보다 이후여야 합니다.')
        return
      }
    }

    setSaving(true)
    setClassroomError('')
    try {
      const dueAt = dueAtStr ? new Date(`${dueAtStr}T23:59:59`) : null
      if (isEdit) {
        await updateAssignment(assignmentId, {
          title: title.trim(),
          dueAt,
          wordLimit: wordLimit ? Number(wordLimit) : null,
          status,
          calculatorEnabled: responseType === 'essay_calculator' ? calculatorEnabled : false,
          waitingRoomEnabled
        })
        navigate(`/admin/assignments/${assignmentId}`)
        return
      }

      const id = await createAssignment({
        responseType,
        passageId: responseType === 'essay' ? passageId : (passageId || null),
        templateId: usesTemplate ? templateId : null,
        calculatorEnabled: responseType === 'essay_calculator' ? calculatorEnabled : false,
        waitingRoomEnabled,
        title: title.trim(),
        dueAt,
        wordLimit: wordLimit ? Number(wordLimit) : null
      })

      if (classroomEnabled && selectedCourseIds.length > 0) {
        setPublishing(true)
        try {
          const linkUrl = `${window.location.origin}/write/${id}`
          // 여러 수업에 순서대로 게시한다 — 하나가 실패해도(예: 일시적 API 오류) 나머지는
          // 계속 시도하고, 성공한 것만 모아서 classrooms 배열로 저장한다.
          const classrooms = []
          const failed = []
          for (const courseId of selectedCourseIds) {
            const course = courses.find(c => c.id === courseId)
            try {
              const result = await createCourseWork(courseId, {
                title: title.trim(),
                description: `서술형 수행평가입니다. 아래 링크에서 지문을 읽고 답안을 작성해주세요.\n${linkUrl}`,
                linkUrl,
                dueDate: dueAt || undefined,
                scheduledAt: scheduledAt || undefined
              })
              classrooms.push({
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
          if (classrooms.length > 0) await updateAssignment(id, { classrooms })
          if (failed.length > 0) {
            alert(`배정은 저장되었지만 다음 수업에는 게시하지 못했습니다: ${failed.join(', ')}\n대시보드에서 다시 시도할 수 있습니다.`)
          }
        } catch (err) {
          // 배정 자체는 이미 만들어졌으니 되돌리지 않는다 — Classroom 게시만 실패했다고
          // 알리고, 교사는 대시보드에서 다시 게시를 시도할 수 있다(AssignmentDashboard.jsx).
          console.error('Classroom 게시 실패:', err)
          alert(`배정은 저장되었지만 Classroom 게시에는 실패했습니다: ${getClassroomErrorMessage(err, '게시')}\n대시보드에서 다시 시도할 수 있습니다.`)
        } finally {
          setPublishing(false)
        }
      }

      navigate(`/admin/assignments/${id}`)
    } catch (err) {
      console.error('배정 저장 실패:', err)
      alert('저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const inputClass = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300'
  const labelClass = 'block text-xs font-bold text-gray-600 mb-1.5'

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-gray-50"><div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" /></div>
  }

  if (accessDenied) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <p className="text-gray-500 mb-4">다른 교사가 만든 배정이라 수정할 수 없습니다.</p>
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
        <h1 className="text-base font-bold text-gray-900">{isEdit ? '배정 수정' : '새 배정 만들기'}</h1>
      </header>

      <main className="flex-1 p-5 max-w-xl mx-auto w-full space-y-5">
        <div>
          <label className={labelClass}>응답 유형</label>
          <div className="flex gap-2">
            {[
              { value: 'essay', label: '서술형 (지문 + 자유서술)' },
              { value: 'essay_calculator', label: '서술형 평가-문항 (양식별 답변 + 채점)' },
              { value: 'structured', label: '구조화된 보고서 (양식에 맞춰 항목별 작성)' }
            ].map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => !isEdit && handleResponseTypeChange(opt.value)}
                disabled={isEdit}
                className={`flex-1 rounded-xl border px-3 py-2.5 text-xs font-medium text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  responseType === opt.value ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {isEdit && <p className="mt-1.5 text-xs text-gray-400">학생 작성 기록의 일관성을 위해 배정 후에는 응답 유형을 바꿀 수 없습니다.</p>}
        </div>

        {responseType === 'essay_calculator' && (
          <div className="-mt-2 space-y-2">
            <p className="text-xs text-gray-400">구조화된 보고서와 같은 문항별 답변 양식이며(지문은 선택), 채점 기능이 제공됩니다.</p>
            <div className="rounded-xl border border-gray-200 bg-white p-3.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={calculatorEnabled}
                  onChange={e => setCalculatorEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-300"
                />
                <span className="text-sm font-bold text-gray-800">🧮 공학용 계산기 제공</span>
              </label>
              <p className="mt-1.5 text-xs text-gray-400">켜면 학생 작성 화면 오른쪽에 공학용 계산기가 항상 표시됩니다(모바일/좁은 화면에서는 버튼으로 열고 닫습니다). 계산이 필요 없는 과목이면 꺼두세요.</p>
            </div>
          </div>
        )}

        {/* 대기실은 응답 유형과 무관하게 쓸 수 있다 — 계산기가 없는 배정이면 학생은 연습용
            입력창만 보게 된다. */}
        <div className="rounded-xl border border-gray-200 bg-white p-3.5">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={waitingRoomEnabled}
              onChange={e => setWaitingRoomEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-300"
            />
            <span className="text-sm font-bold text-gray-800">⏳ 평가 시작 전 준비 시간(대기실) 사용</span>
          </label>
          <p className="mt-1.5 text-xs text-gray-400">켜면 학생은 접속해도 문항이 보이지 않고, 연습용 입력창{responseType === 'essay_calculator' && calculatorEnabled ? '과 공학용 계산기' : ''}만 써볼 수 있습니다. 대시보드에서 "평가 시작"을 누르는 순간 모든 학생 화면에 문항이 나타납니다.</p>
        </div>

        {usesTemplate && (
          <div>
            <label className={labelClass}>{responseType === 'essay_calculator' ? '문항 세트 / 보고서 양식' : '보고서 양식'}</label>
            {templates.length === 0 ? (
              <p className="text-sm text-gray-400">활성화된 양식이 없습니다. 먼저 "서술형 문항 관리" 또는 "보고서 양식 관리"에서 만들어주세요.</p>
            ) : (
              <select className={inputClass} value={templateId} onChange={e => setTemplateId(e.target.value)} disabled={isEdit}>
                {/* 서술형 평가-문항이면 문항 세트를 먼저 보여준다 — 두 종류 모두 같은 섹션 구조라
                    어느 쪽을 골라도 동작은 같다. */}
                {(responseType === 'essay_calculator' ? ['question_set', 'report'] : ['report', 'question_set']).map(kind => {
                  const group = templates.filter(t => getTemplateKind(t) === kind)
                  if (group.length === 0) return null
                  const isQuestionSet = kind === TEMPLATE_KIND_QUESTION_SET
                  return (
                    <optgroup key={kind} label={isQuestionSet ? '서술형 문항 세트' : '보고서 양식'}>
                      {group.map(t => (
                        <option key={t.id} value={t.id}>{t.title} ({t.sections?.length || 0}개 {isQuestionSet ? '문항' : '섹션'})</option>
                      ))}
                    </optgroup>
                  )
                })}
              </select>
            )}
          </div>
        )}

        <div>
          <label className={labelClass}>
            지문 선택{responseType !== 'essay' && ' (선택, 참고 자료로만 보여줍니다)'}
          </label>
          {passages.length === 0 ? (
            <p className="text-sm text-gray-400">활성화된 지문이 없습니다.{responseType === 'essay' && ' 먼저 지문을 등록해주세요.'}</p>
          ) : (
            <select className={inputClass} value={passageId} onChange={e => setPassageId(e.target.value)} disabled={isEdit}>
              {responseType !== 'essay' && <option value="">지문 없음</option>}
              {passages.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          )}
          {isEdit && <p className="mt-1.5 text-xs text-gray-400">학생 작성 기록의 일관성을 위해 배정된 지문은 변경할 수 없습니다.</p>}
        </div>

        <div>
          <label className={labelClass}>배정 제목</label>
          <input className={inputClass} value={title} onChange={e => setTitle(e.target.value)} placeholder="예: 2학기 서술형 수행평가 — 밀리컨 실험" />
        </div>

        <div>
          <label className={labelClass}>마감일 (선택)</label>
          <input type="date" className={inputClass} value={dueAtStr} onChange={e => setDueAtStr(e.target.value)} />
        </div>

        {responseType === 'essay' && (
          <div>
            <label className={labelClass}>목표 분량 override (선택, 비우면 지문 기본값 사용)</label>
            <input type="number" className={`${inputClass} max-w-[140px]`} value={wordLimit} onChange={e => setWordLimit(e.target.value)} placeholder="800" />
          </div>
        )}

        {isEdit && (
          <div>
            <label className={labelClass}>배정 상태</label>
            <select className={`${inputClass} max-w-[180px]`} value={status} onChange={e => setStatus(e.target.value)}>
              <option value="open">진행 중</option>
              <option value="closed">마감</option>
            </select>
          </div>
        )}

        {/* Classroom 연동은 새로 만들 때만 이 화면에서 설정한다. 기존 배정에 나중에 연결하는
            것은 대시보드(AssignmentDashboard.jsx)에서 하며, 거기서도 예약 게시를 걸 수 있다. */}
        {!isEdit && (
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={classroomEnabled}
                onChange={e => setClassroomEnabled(e.target.checked)}
                disabled={!hasClassroomConfig()}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-300"
              />
              <span className="text-sm font-bold text-gray-800">🎓 Google Classroom에도 게시</span>
            </label>

            {!hasClassroomConfig() ? (
              <p className="mt-1.5 text-xs text-gray-400">VITE_GOOGLE_CLIENT_ID 환경변수가 설정되지 않아 Classroom 게시를 사용할 수 없습니다. 링크를 직접 공유해주세요.</p>
            ) : classroomEnabled && (
              <div className="mt-3 space-y-3">
                {!courses ? (
                  <button
                    type="button"
                    onClick={handleConnectClassroom}
                    disabled={connecting}
                    className="w-full py-2.5 rounded-xl border border-gray-200 text-sm font-medium hover:bg-gray-50 disabled:opacity-40"
                  >
                    {connecting ? '연결 중...' : 'Classroom 연결하기'}
                  </button>
                ) : courses.length === 0 ? (
                  <p className="text-xs text-gray-400">담당 중인 활성 수업이 없습니다.</p>
                ) : (
                  <>
                    <div>
                      <label className={labelClass}>게시할 수업 (여러 개 선택 가능 — 같은 과제를 여러 반에 동시 배정)</label>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto rounded-xl border border-gray-200 p-2">
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
                    </div>
                    <div>
                      <label className={labelClass}>게시 시점</label>
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
                    </div>
                    {publishMode === 'scheduled' && (
                      <div>
                        <label className={labelClass}>예약 게시 시각</label>
                        <input
                          type="datetime-local"
                          className={inputClass}
                          value={scheduledAtStr}
                          min={nowForDatetimeLocal()}
                          onChange={e => setScheduledAtStr(e.target.value)}
                        />
                        <p className="mt-1 text-xs text-gray-400">지정한 시각까지 Classroom에 초안으로만 남아있다가, 그 시각에 자동으로 학생들에게 공개됩니다.</p>
                      </div>
                    )}
                  </>
                )}
                {classroomError && <p className="text-xs text-red-500">{classroomError}</p>}
              </div>
            )}
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving || publishing || (responseType === 'essay' && passages.length === 0) || (usesTemplate && templates.length === 0)}
          className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:opacity-40 transition-colors"
        >
          {publishing ? 'Classroom에 게시 중...' : saving ? '저장 중...' : isEdit ? '변경 사항 저장' : '배정 저장'}
        </button>
      </main>
    </div>
  )
}
