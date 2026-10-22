import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getAssignment, getSubmission, getReplayLogs, saveGrading, setScoreReleased, getFocusEvents } from '../../services/essay.js'
import { LEAVE_TYPE_LABELS, DISPLAY_MODE_LABELS, formatDuration } from '../../utils/focusGuard.js'
import { getTemplate } from '../../services/reportTemplates.js'
import ReplayPlayer from '../../components/ReplayPlayer.jsx'
import ExperimentReport from '../../components/experiment/ExperimentReport.jsx'
import AnnotatedAnswer from '../../components/feedback/AnnotatedAnswer.jsx'
import { subscribeExperimentResult } from '../../services/experiments.js'
import { saveFeedbackNotes, setFeedbackReleased, subscribeFeedback } from '../../services/feedback.js'

// 노트가 없을 때도 같은 배열을 넘겨야 AnnotatedAnswer가 매 렌더마다 형광펜을 다시 씌우지 않는다.
const EMPTY_NOTES = []

// "섹션 선택" 드롭다운에서 개별 섹션이 아니라 전체를 한 번에 보고 싶을 때 고르는 값.
const ALL_SECTIONS = '__all__'

/** essay_calculator("서술형 평가-문항") 전용 채점 패널 — 문항별 점수 입력 + 총점 + 공개 토글.
 * 점수 저장과 공개는 서로 다른 동작이라(services/essay.js의 saveGrading/setScoreReleased)
 * 버튼도 분리했다 — 교사가 채점을 다 마치기 전까지는 학생에게 안 보이게 둘 수 있다. */
function GradingPanel({ template, submission, onSaved }) {
  const [scores, setScores] = useState({})
  const [saving, setSaving] = useState(false)
  const [releasing, setReleasing] = useState(false)

  useEffect(() => {
    const initial = {}
    for (const sec of template?.sections || []) {
      const v = submission?.sections?.[sec.id]?.score
      initial[sec.id] = v == null ? '' : String(v)
    }
    setScores(initial)
  }, [template, submission?.id])

  const sections = template?.sections || []
  if (sections.length === 0) return null

  const totalEntered = Object.values(scores).reduce((sum, v) => sum + (v === '' ? 0 : Number(v) || 0), 0)
  const totalMax = sections.reduce((sum, s) => sum + (s.maxScore || 0), 0)

  async function handleSave() {
    setSaving(true)
    try {
      const numeric = Object.fromEntries(Object.entries(scores).map(([id, v]) => [id, v === '' ? null : Number(v)]))
      await saveGrading(submission.id, numeric)
      onSaved(numeric, totalEntered)
    } catch (err) {
      console.error('채점 저장 실패:', err)
      alert('채점 저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleRelease() {
    setReleasing(true)
    try {
      const next = !submission.scoreReleased
      await setScoreReleased(submission.id, next)
      onSaved(null, null, next)
    } catch (err) {
      console.error('공개 상태 변경 실패:', err)
      alert('공개 상태를 바꾸는 중 오류가 발생했습니다.')
    } finally {
      setReleasing(false)
    }
  }

  return (
    <div className="mt-5 rounded-2xl border border-gray-200 bg-white p-4 print:hidden">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-700">채점</h2>
        <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${submission.scoreReleased ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {submission.scoreReleased ? '학생에게 공개됨' : '학생에게 비공개'}
        </span>
      </div>
      <div className="space-y-2">
        {sections.map(sec => (
          <div key={sec.id} className="flex items-center justify-between gap-3">
            <span className="truncate text-sm text-gray-600">{sec.heading || sec.groupLabel || '섹션'}</span>
            <div className="flex flex-shrink-0 items-center gap-1">
              <input
                type="number"
                className="w-20 rounded-lg border border-gray-200 px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                value={scores[sec.id] ?? ''}
                onChange={e => setScores(s => ({ ...s, [sec.id]: e.target.value }))}
                placeholder="0"
              />
              <span className="w-10 text-xs text-gray-400">/ {sec.maxScore ?? '—'}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
        <p className="text-sm font-bold text-gray-800">총점 {totalEntered}{totalMax > 0 ? ` / ${totalMax}` : ''}</p>
        <div className="flex gap-2">
          <button onClick={handleSave} disabled={saving} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-40">
            {saving ? '저장 중...' : '점수 저장'}
          </button>
          <button onClick={handleToggleRelease} disabled={releasing} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40">
            {releasing ? '변경 중...' : submission.scoreReleased ? '공개 취소' : '학생에게 공개'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** 제한시간 평가의 화면 이탈 기록(hooks/useFocusGuard.js가 남김) — 없으면 아무것도 안 그린다. */
function FocusEventsPanel({ submission, events }) {
  if (!submission?.leaveCount && !events?.length && !submission?.displayMode) return null
  const clock = ms => new Date(ms).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  return (
    <div className="print:hidden mt-4 bg-white rounded-2xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-gray-700">🚨 화면 이탈 기록</h2>
        {submission.displayMode && (
          <span className="text-xs text-gray-400">접속 환경: {DISPLAY_MODE_LABELS[submission.displayMode] || submission.displayMode}</span>
        )}
      </div>
      {submission.leaveCount > 0 ? (
        <>
          <p className="text-sm text-red-600 font-medium mb-2">
            총 {submission.leaveCount}회{submission.leaveTotalMs ? ` · 누적 ${formatDuration(submission.leaveTotalMs)}` : ''}
          </p>
          {events?.length > 0 ? (
            <ul className="divide-y divide-gray-50 text-sm">
              {events.map(e => (
                <li key={e.id} className="flex items-center justify-between py-1.5">
                  <span className="text-gray-700">{clock(e.leftAt)} ~ {clock(e.returnedAt)} <span className="text-xs text-gray-400">· {LEAVE_TYPE_LABELS[e.type] || e.type}</span></span>
                  <span className="text-xs font-medium text-gray-600">{formatDuration(e.durationMs)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {(events?.length || 0) < submission.leaveCount && (
            <p className="mt-2 text-xs text-gray-400">돌아오지 않은(창을 닫았거나 제출 중이던) 이탈은 지속시간이 기록되지 않습니다.</p>
          )}
        </>
      ) : (
        <p className="text-sm text-gray-400">이탈 기록이 없습니다.</p>
      )}
    </div>
  )
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * 섹션마다 따로 쌓인 입력 로그를 "그 시점까지 각 섹션이 마지막으로 어떤 모습이었는지"를
 * 이어붙인 합성 스냅샷으로 바꾼다. ReplayPlayer는 이벤트의 value를 "그 시점의 전체 내용"으로
 * 그대로 그리므로(섹션 구분 없이 하나의 value만 다룰 수 있다), 섹션별 최신 상태를 제목과
 * 함께 이어붙여 넘긴다 — ReplayPlayer 자체는 손대지 않는다.
 */
function mergeSectionInputEvents(events, sections) {
  const latestBySection = {}
  return events.map(ev => {
    latestBySection[ev.sectionId] = ev.value
    const combined = sections
      .map(sec => {
        const html = latestBySection[sec.id]
        if (!html) return ''
        const heading = escapeHtml(sec.heading || sec.groupLabel || '')
        return `<p><strong>${heading}</strong></p>${html}`
      })
      .filter(Boolean)
      .join('')
    return { ...ev, value: combined }
  })
}

/** structured 제출물은 AI 신호가 섹션별로 쌓이므로, 전체 보기에서는 섹션들을 합쳐서 보여준다. */
function aggregateAiFlags(submission) {
  const flagsList = Object.values(submission?.sections || {}).map(s => s.aiFlags).filter(Boolean)
  if (!flagsList.length) return null
  return {
    score: Math.max(...flagsList.map(f => f.score || 0)),
    phraseMatches: [...new Set(flagsList.flatMap(f => f.phraseMatches || []))],
    markdownHits: flagsList.some(f => f.markdownHits)
  }
}

export default function ReplayView() {
  const { assignmentId, uid } = useParams()
  const navigate = useNavigate()
  const [assignment, setAssignment] = useState(null)
  const [submission, setSubmission] = useState(null)
  const [template, setTemplate] = useState(null)
  const [logs, setLogs] = useState(null)
  const [sectionId, setSectionId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exportingDocx, setExportingDocx] = useState(false)
  const [focusEvents, setFocusEvents] = useState(null)
  // 실험 연결 배정이면 이 학생의 실험 결과도 함께 보여준다(채점 근거).
  const [experimentResult, setExperimentResult] = useState(undefined)
  const hasExperiment = Boolean(assignment?.experiment)
  useEffect(() => {
    if (!hasExperiment) return
    return subscribeExperimentResult(assignmentId, uid, setExperimentResult)
  }, [hasExperiment, assignmentId, uid])

  // 포스트잇 피드백 — 교사만 쓰고, 학생은 "피드백 공개" 뒤에만 읽는다(services/feedback.js).
  // 피드백 모드에선 재생 패널을 접고 답안을 넓게 펴서 오른쪽 여백에 노트를 띄운다.
  const [feedback, setFeedback] = useState(null)
  const [feedbackMode, setFeedbackMode] = useState(false)
  const [feedbackError, setFeedbackError] = useState('')
  const [releasingFeedback, setReleasingFeedback] = useState(false)
  useEffect(() => subscribeFeedback(
    `${assignmentId}__${uid}`,
    setFeedback,
    () => setFeedbackError('피드백을 불러오지 못했습니다.')
  ), [assignmentId, uid])
  const notes = feedback?.notes || EMPTY_NOTES
  const feedbackReleased = Boolean(feedback?.released)
  // 연달아 고쳐도(만들자마자 색 바꾸기 등) 앞의 변경이 사라지지 않게 최신 노트를 ref로 잡는다.
  const notesRef = useRef(notes)
  notesRef.current = notes

  function persistNotes(next) {
    notesRef.current = next
    setFeedback(f => ({ ...(f || {}), notes: next }))
    setFeedbackError('')
    saveFeedbackNotes(submission, next).catch(err => {
      console.error('피드백 저장 실패:', err)
      setFeedbackError('피드백 저장에 실패했습니다. 다시 시도해주세요.')
    })
  }
  const handleCreateNote = note => persistNotes([...notesRef.current, note])
  const handleUpdateNote = (id, patch) => persistNotes(notesRef.current.map(n => (n.id === id ? { ...n, ...patch } : n)))
  const handleDeleteNote = id => persistNotes(notesRef.current.filter(n => n.id !== id))

  async function handleToggleFeedbackRelease() {
    const next = !feedbackReleased
    setReleasingFeedback(true)
    try {
      await setFeedbackReleased(submission, next)
      setFeedback(f => ({ ...(f || {}), released: next }))
    } catch (err) {
      console.error('피드백 공개 변경 실패:', err)
      alert('피드백 공개 상태를 바꾸지 못했습니다.')
    } finally {
      setReleasingFeedback(false)
    }
  }

  useEffect(() => {
    const subId = `${assignmentId}__${uid}`
    Promise.all([getAssignment(assignmentId), getSubmission(subId), getReplayLogs(subId)])
      .then(async ([a, sub, replayLogs]) => {
        setAssignment(a)
        setSubmission(sub)
        setLogs(replayLogs)
        if (sub?.leaveCount > 0) getFocusEvents(subId).then(setFocusEvents).catch(() => setFocusEvents([]))
        if ((a?.responseType === 'structured' || a?.responseType === 'essay_calculator') && a.templateId) {
          const tpl = await getTemplate(a.templateId)
          setTemplate(tpl)
          if (tpl?.sections?.length) setSectionId(tpl.sections[0].id)
        }
      })
      .catch(err => {
        // 다른 교사가 만든 배정의 제출물이면 firestore.rules가 여기서 막는다(권한 거부).
        console.error('제출물 조회 실패:', err)
        setError('이 제출물을 볼 권한이 없습니다.')
      })
      .finally(() => setLoading(false))
  }, [assignmentId, uid])

  const usesSections = assignment?.responseType === 'structured' || assignment?.responseType === 'essay_calculator'
  const isGradable = assignment?.responseType === 'essay_calculator'

  function handleGradingSaved(sectionScoreUpdates, totalScore, releasedOverride) {
    setSubmission(s => {
      if (!s) return s
      if (typeof releasedOverride === 'boolean') return { ...s, scoreReleased: releasedOverride }
      const nextSections = { ...(s.sections || {}) }
      for (const [id, score] of Object.entries(sectionScoreUpdates || {})) {
        nextSections[id] = { ...(nextSections[id] || {}), score }
      }
      return { ...s, sections: nextSections, totalScore }
    })
  }

  // sections 기반 제출물(structured/essay_calculator)은 리플레이 로그 이벤트마다 sectionId가 실려 있다(services/essay.js) —
  // 선택된 섹션의 이벤트만 걸러서 ReplayPlayer에 넘긴다. "전체 보기"를 고르면 필터링 대신
  // 섹션별 최신 상태를 이어붙인 합성 스냅샷으로 바꿔서 넘긴다(mergeSectionInputEvents).
  // 두 경우 모두 ReplayPlayer 자체는 손대지 않는다 — 그저 받는 배열이 다를 뿐이다.
  const filteredLogs = useMemo(() => {
    if (!logs) return null
    if (!template) return logs
    if (sectionId === ALL_SECTIONS) {
      return {
        inputEvents: mergeSectionInputEvents(logs.inputEvents, template.sections || []),
        keydownEvents: logs.keydownEvents,
        pasteEvents: logs.pasteEvents
      }
    }
    if (!sectionId) return logs
    return {
      inputEvents: logs.inputEvents.filter(e => e.sectionId === sectionId),
      keydownEvents: logs.keydownEvents.filter(e => e.sectionId === sectionId),
      pasteEvents: logs.pasteEvents.filter(e => e.sectionId === sectionId)
    }
  }, [logs, template, sectionId])

  const aiFlags = !template
    ? submission?.aiFlags
    : sectionId === ALL_SECTIONS
      ? aggregateAiFlags(submission)
      : sectionId
        ? submission?.sections?.[sectionId]?.aiFlags
        : submission?.aiFlags

  async function handleExportDocx() {
    setExportingDocx(true)
    try {
      // docx 라이브러리가 꽤 무거워서(수백 KB) 실제로 내보내기를 누를 때만 불러온다 —
      // 학생 등 이 버튼을 쓸 일이 없는 대부분의 방문에서는 번들에 안 실리게 하기 위함.
      const { exportAnswerToDocx } = await import('../../utils/exportDocx.js')
      const sections = usesSections
        ? (template?.sections || []).map(sec => ({
          groupLabel: sec.groupLabel,
          heading: sec.heading,
          // 실험 결과 섹션은 제출된 보고서 PNG(학생이 정한 배치 그대로)를 그림으로 넣는다
          html: sec.type === 'experiment'
            ? (experimentResult?.pngUrl ? `<p><img src="${experimentResult.pngUrl}" alt="실험 보고서"></p>` : '<p>(실험 결과 미제출)</p>')
            : submission?.sections?.[sec.id]?.text || ''
        }))
        : [{ html: submission?.text || '' }]
      await exportAnswerToDocx({ title: assignment?.title, studentName: submission?.studentName, sections })
    } catch (err) {
      console.error('DOCX 내보내기 실패:', err)
      alert('DOCX로 내보내는 중 오류가 발생했습니다.')
    } finally {
      setExportingDocx(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="print:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shadow-sm sticky top-0 z-10">
        <button onClick={() => navigate(`/admin/assignments/${assignmentId}`)} className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-base font-bold text-gray-900">{submission?.studentName || '작성 과정 재생'}</h1>
          <p className="text-xs text-gray-500">{submission?.studentClass ? `${submission.studentClass}반` : ''}</p>
        </div>
      </header>

      {/* 화면에선 안 보이고 인쇄(PDF 저장)할 때만 보이는 제목 — header가 print:hidden이라 대신 필요 */}
      <div className="hidden print:block mb-3">
        <h1 className="text-lg font-bold">{assignment?.title}</h1>
        <p className="text-sm text-gray-600">{submission?.studentName} {submission?.studentClass ? `· ${submission.studentClass}반` : ''}</p>
      </div>

      <main className="flex-1 p-5 max-w-6xl mx-auto w-full">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-16 text-gray-400">{error}</div>
        ) : !submission ? (
          <div className="text-center py-16 text-gray-400">제출물을 찾을 수 없습니다.</div>
        ) : (
          <div className={`grid grid-cols-1 gap-6 ${feedbackMode ? '' : 'lg:grid-cols-2'}`}>
            {/* 왼쪽: 전체 작성 내용 한눈에 보기 + 내보내기 */}
            <section className="print:col-span-2">
              <div className="print:hidden flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-gray-700">전체 작성 내용</h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => setFeedbackMode(m => !m)}
                    className={`text-xs rounded-lg px-3 py-1.5 font-semibold transition-colors ${feedbackMode ? 'bg-gray-900 text-white hover:bg-gray-700' : 'border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'}`}
                  >
                    {feedbackMode ? '✓ 피드백 달기 끝내기' : '📝 피드백 달기'}
                  </button>
                  <button
                    onClick={handleExportDocx}
                    disabled={exportingDocx}
                    className="text-xs rounded-lg border border-gray-200 px-3 py-1.5 font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                  >
                    {exportingDocx ? 'DOCX 생성 중...' : 'DOCX로 내보내기'}
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="text-xs rounded-lg border border-gray-200 px-3 py-1.5 font-medium text-gray-600 hover:bg-gray-50"
                  >
                    PDF로 내보내기
                  </button>
                </div>
              </div>
              {hasExperiment && (
                <div className="mb-4 bg-white rounded-2xl border border-gray-200 p-5 print:border-0 print:p-0">
                  <h2 className="text-sm font-bold text-gray-700 mb-3">🎥 실험 결과</h2>
                  {experimentResult === undefined ? (
                    <p className="text-sm text-gray-300">불러오는 중...</p>
                  ) : experimentResult ? (
                    <ExperimentReport result={experimentResult} />
                  ) : (
                    <p className="text-sm text-gray-400">아직 실험 결과를 제출하지 않았습니다.</p>
                  )}
                </div>
              )}
              <div className="bg-white rounded-2xl border border-gray-200 p-5 print:border-0 print:p-0">
                {(feedbackMode || notes.length > 0) && (
                  <div className="print:hidden mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-amber-50/70 px-3 py-2 text-xs text-amber-900">
                    <span className="font-semibold">📝 포스트잇 {notes.length}개</span>
                    {feedbackMode && <span className="text-amber-800/70">문장을 드래그하거나 그림·표·수식을 클릭해 붙이세요. 포스트잇 윗줄을 끌면 이동, 오른쪽 아래 모서리로 크기 조절.</span>}
                    {feedbackError && <span className="text-red-600">{feedbackError}</span>}
                    <span className={`ml-auto rounded-full px-2 py-0.5 font-medium ${feedbackReleased ? 'bg-green-100 text-green-700' : 'bg-white text-gray-500'}`}>
                      {feedbackReleased ? '학생에게 공개됨' : '학생에게 비공개'}
                    </span>
                    <button
                      onClick={handleToggleFeedbackRelease}
                      disabled={releasingFeedback || (!feedbackReleased && notes.length === 0)}
                      className={`rounded-lg px-3 py-1 font-medium transition-colors disabled:opacity-40 ${feedbackReleased ? 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50' : 'bg-green-600 text-white hover:bg-green-700'}`}
                    >
                      {releasingFeedback ? '변경 중...' : feedbackReleased ? '공개 취소' : '피드백 공개'}
                    </button>
                  </div>
                )}
                <AnnotatedAnswer
                  usesSections={usesSections}
                  template={template}
                  submission={submission}
                  experimentResult={experimentResult}
                  notes={notes}
                  editable={feedbackMode}
                  onCreate={handleCreateNote}
                  onUpdate={handleUpdateNote}
                  onDelete={handleDeleteNote}
                />
              </div>
              {isGradable && <GradingPanel template={template} submission={submission} onSaved={handleGradingSaved} />}
              <FocusEventsPanel submission={submission} events={focusEvents} />
            </section>

            {/* 오른쪽: 기존 로그 점검(리플레이) 기능 */}
            <section className={`print:hidden ${feedbackMode ? 'hidden' : ''}`}>
              <h2 className="text-sm font-bold text-gray-700 mb-3">작성 과정 로그</h2>
              {template?.sections?.length > 0 && (
                <div className="mb-4">
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">섹션 선택</label>
                  <select
                    value={sectionId}
                    onChange={e => setSectionId(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white"
                  >
                    <option value={ALL_SECTIONS}>전체 보기 (모든 섹션)</option>
                    {template.sections.map(sec => (
                      <option key={sec.id} value={sec.id}>{sec.heading || sec.groupLabel || '섹션'}</option>
                    ))}
                  </select>
                </div>
              )}
              <ReplayPlayer
                inputEvents={filteredLogs.inputEvents}
                keydownEvents={filteredLogs.keydownEvents}
                pasteEvents={filteredLogs.pasteEvents}
                aiFlags={aiFlags}
              />
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
