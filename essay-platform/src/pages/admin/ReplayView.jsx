import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getAssignment, getSubmission, getReplayLogs } from '../../services/essay.js'
import { getTemplate } from '../../services/reportTemplates.js'
import { sanitizeAnswerHtml } from '../../utils/sanitizeHtml.js'
import ReplayPlayer from '../../components/ReplayPlayer.jsx'

const ANSWER_HTML_CLASS = 'text-[15px] leading-relaxed text-gray-800 whitespace-pre-wrap [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg'

/** 왼쪽 패널 — 로그 재생과 무관하게, 지금까지 저장된 최종 답안 전체를 한 번에 보여준다. */
function FullAnswerView({ isStructured, template, submission }) {
  if (isStructured) {
    let lastGroup = null
    const sections = template?.sections || []
    if (sections.length === 0) return <p className="text-sm text-gray-300">양식을 불러오지 못했습니다.</p>
    return (
      <div className="space-y-4">
        {sections.map(sec => {
          const showGroup = sec.groupLabel && sec.groupLabel !== lastGroup
          lastGroup = sec.groupLabel
          const html = sanitizeAnswerHtml(submission?.sections?.[sec.id]?.text || '')
          return (
            <React.Fragment key={sec.id}>
              {showGroup && <h2 className="text-sm font-bold text-indigo-700 border-b border-indigo-100 pb-1.5 pt-2">{sec.groupLabel}</h2>}
              <div>
                {sec.heading && <h3 className="text-sm font-bold text-gray-800 mb-1">{sec.heading}</h3>}
                {html ? <div className={ANSWER_HTML_CLASS} dangerouslySetInnerHTML={{ __html: html }} /> : <p className="text-sm text-gray-300">(작성 내용 없음)</p>}
              </div>
            </React.Fragment>
          )
        })}
      </div>
    )
  }
  const html = sanitizeAnswerHtml(submission?.text || '')
  return html
    ? <div className={ANSWER_HTML_CLASS} dangerouslySetInnerHTML={{ __html: html }} />
    : <p className="text-sm text-gray-300">(작성 내용 없음)</p>
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

  useEffect(() => {
    const subId = `${assignmentId}__${uid}`
    Promise.all([getAssignment(assignmentId), getSubmission(subId), getReplayLogs(subId)])
      .then(async ([a, sub, replayLogs]) => {
        setAssignment(a)
        setSubmission(sub)
        setLogs(replayLogs)
        if (a?.responseType === 'structured' && a.templateId) {
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

  const isStructured = assignment?.responseType === 'structured'

  // structured 제출물은 리플레이 로그 이벤트마다 sectionId가 실려 있다(services/essay.js) —
  // 선택된 섹션의 이벤트만 걸러서 ReplayPlayer에 넘긴다. ReplayPlayer 자체는 필터링된
  // 배열만 받으므로 변경할 필요가 없다.
  const filteredLogs = useMemo(() => {
    if (!logs) return null
    if (!template || !sectionId) return logs
    return {
      inputEvents: logs.inputEvents.filter(e => e.sectionId === sectionId),
      keydownEvents: logs.keydownEvents.filter(e => e.sectionId === sectionId),
      pasteEvents: logs.pasteEvents.filter(e => e.sectionId === sectionId)
    }
  }, [logs, template, sectionId])

  const aiFlags = template && sectionId
    ? submission?.sections?.[sectionId]?.aiFlags
    : submission?.aiFlags

  async function handleExportDocx() {
    setExportingDocx(true)
    try {
      // docx 라이브러리가 꽤 무거워서(수백 KB) 실제로 내보내기를 누를 때만 불러온다 —
      // 학생 등 이 버튼을 쓸 일이 없는 대부분의 방문에서는 번들에 안 실리게 하기 위함.
      const { exportAnswerToDocx } = await import('../../utils/exportDocx.js')
      const sections = isStructured
        ? (template?.sections || []).map(sec => ({
          groupLabel: sec.groupLabel,
          heading: sec.heading,
          html: submission?.sections?.[sec.id]?.text || ''
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 왼쪽: 전체 작성 내용 한눈에 보기 + 내보내기 */}
            <section className="print:col-span-2">
              <div className="print:hidden flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-gray-700">전체 작성 내용</h2>
                <div className="flex gap-2">
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
              <div className="bg-white rounded-2xl border border-gray-200 p-5 print:border-0 print:p-0">
                <FullAnswerView isStructured={isStructured} template={template} submission={submission} />
              </div>
            </section>

            {/* 오른쪽: 기존 로그 점검(리플레이) 기능 */}
            <section className="print:hidden">
              <h2 className="text-sm font-bold text-gray-700 mb-3">작성 과정 로그</h2>
              {template?.sections?.length > 0 && (
                <div className="mb-4">
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">섹션 선택</label>
                  <select
                    value={sectionId}
                    onChange={e => setSectionId(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white"
                  >
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
