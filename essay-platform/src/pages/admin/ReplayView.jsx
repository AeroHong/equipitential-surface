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
  const [error, setError] = useState('')

  useEffect(() => {
    const subId = `${assignmentId}__${uid}`
    Promise.all([getSubmission(subId), getReplayLogs(subId)])
      .then(([sub, replayLogs]) => {
        setSubmission(sub)
        setLogs(replayLogs)
      })
      .catch(err => {
        // 다른 교사가 만든 배정의 제출물이면 firestore.rules가 여기서 막는다(권한 거부).
        console.error('제출물 조회 실패:', err)
        setError('이 제출물을 볼 권한이 없습니다.')
      })
      .finally(() => setLoading(false))
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
        ) : error ? (
          <div className="text-center py-16 text-gray-400">{error}</div>
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
