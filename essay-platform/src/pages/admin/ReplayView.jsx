import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getSubmission, getReplayLogs } from '../../services/essay.js'
import ReplayPlayer from '../../components/ReplayPlayer.jsx'

export default function ReplayView() {
  const { assignmentId, uid } = useParams()
  const navigate = useNavigate()
  const [submission, setSubmission] = useState(null)
  const [logs, setLogs] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const subId = `${assignmentId}__${uid}`
    Promise.all([getSubmission(subId), getReplayLogs(subId)]).then(([sub, replayLogs]) => {
      setSubmission(sub)
      setLogs(replayLogs)
      setLoading(false)
    })
  }, [assignmentId, uid])

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
        ) : !submission ? (
          <div className="text-center py-16 text-gray-400">제출물을 찾을 수 없습니다.</div>
        ) : (
          <ReplayPlayer
            inputEvents={logs.inputEvents}
            keydownEvents={logs.keydownEvents}
            pasteEvents={logs.pasteEvents}
            aiFlags={submission.aiFlags}
          />
        )}
      </main>
    </div>
  )
}
