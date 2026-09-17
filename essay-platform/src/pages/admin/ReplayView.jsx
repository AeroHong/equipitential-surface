import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getAssignment, getSubmission, getReplayLogs } from '../../services/essay.js'
import { getTemplate } from '../../services/reportTemplates.js'
import ReplayPlayer from '../../components/ReplayPlayer.jsx'

export default function ReplayView() {
  const { assignmentId, uid } = useParams()
  const navigate = useNavigate()
  const [submission, setSubmission] = useState(null)
  const [template, setTemplate] = useState(null)
  const [logs, setLogs] = useState(null)
  const [sectionId, setSectionId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const subId = `${assignmentId}__${uid}`
    Promise.all([getAssignment(assignmentId), getSubmission(subId), getReplayLogs(subId)])
      .then(async ([a, sub, replayLogs]) => {
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

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shadow-sm sticky top-0 z-10">
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

      <main className="flex-1 p-5 max-w-3xl mx-auto w-full">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-16 text-gray-400">{error}</div>
        ) : !submission ? (
          <div className="text-center py-16 text-gray-400">제출물을 찾을 수 없습니다.</div>
        ) : (
          <>
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
          </>
        )}
      </main>
    </div>
  )
}
