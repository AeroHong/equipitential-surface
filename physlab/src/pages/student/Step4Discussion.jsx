import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getSession, saveAnswers } from '../../services/firebase.js'

export const DISCUSSION_QUESTIONS = [
  {
    id: 'q1',
    text: '측정한 등전위선의 모양은 어떠했나요? 전극의 종류(점전극/선전극)에 따라 모양이 어떻게 달라지는지 설명하세요.',
  },
  {
    id: 'q2',
    text: '전기력선과 등전위선은 어떤 관계가 있나요? 직접 그린 전기력선과 등전위선을 비교하여 설명하세요.',
  },
  {
    id: 'q3',
    text: '전극 가까운 곳과 먼 곳에서 등전위선의 간격이 다른 이유는 무엇인가요? 전기장의 세기와 연결하여 생각해 보세요.',
  },
  {
    id: 'q4',
    text: '실험 측정값에 오차가 발생했다면, 그 원인은 무엇이라고 생각하나요? 오차를 줄일 수 있는 방법도 제안해 보세요.',
  },
  {
    id: 'q5',
    text: '이번 실험에서 새롭게 알게 된 점, 또는 더 탐구해 보고 싶은 점을 자유롭게 작성하세요.',
  },
]

export default function Step4Discussion() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const [session, setSession] = useState(null)
  const [answers, setAnswers] = useState({})
  const [saveStatus, setSaveStatus] = useState('idle') // 'idle' | 'saving' | 'saved'
  const [loading, setLoading] = useState(true)
  const debounceRef = useRef(null)

  useEffect(() => {
    getSession(sessionId).then(s => {
      if (!s) { navigate('/student'); return }
      setSession(s)
      if (s.answers) setAnswers(s.answers)
      setLoading(false)
    })
  }, [sessionId])

  function handleChange(qid, text) {
    const updated = { ...answers, [qid]: text }
    setAnswers(updated)
    setSaveStatus('saving')

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        await saveAnswers(sessionId, updated)
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 3000)
      } catch {
        setSaveStatus('idle')
      }
    }, 1500)
  }

  async function handleFinish() {
    // 현재 답변 저장 후 종료
    if (Object.keys(answers).length > 0) {
      try {
        await saveAnswers(sessionId, answers)
      } catch {}
    }
    navigate('/student')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const EXP_LABEL = session?.experimentType === 'line_electrode' ? '실험 2 — 선전극' : '실험 1 — 점전극'
  const answeredCount = DISCUSSION_QUESTIONS.filter(q => answers[q.id]?.trim()).length

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shadow-sm sticky top-0 z-10">
        <button
          onClick={() => navigate(`/student/session/${sessionId}/step3`)}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-gray-900">{EXP_LABEL}</h1>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-indigo-100 text-indigo-700 rounded-full px-2 py-0.5 font-medium">Step 4</span>
            <span className="text-xs text-gray-500">토론 문제</span>
          </div>
        </div>
        {/* 저장 상태 */}
        <div className="text-xs">
          {saveStatus === 'saving' && (
            <span className="flex items-center gap-1 text-amber-600">
              <div className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              저장 중...
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1 text-green-600">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              저장됨
            </span>
          )}
        </div>
      </header>

      {/* 진행 단계 */}
      <div className="bg-white border-b border-gray-100 px-4 py-2 flex items-center gap-2">
        {[
          { n: 1, label: '데이터 입력' },
          { n: 2, label: '전기력선' },
          { n: 3, label: '3D 결과' },
          { n: 4, label: '토론' },
        ].map(({ n, label }, idx, arr) => (
          <React.Fragment key={n}>
            <div className={`flex items-center gap-1.5 text-xs font-medium ${n === 4 ? 'text-indigo-600' : 'text-green-600'}`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${n === 4 ? 'bg-indigo-600 text-white' : 'bg-green-500 text-white'}`}>
                {n < 4 ? '✓' : n}
              </div>
              <span className="hidden sm:inline">{label}</span>
            </div>
            {idx < arr.length - 1 && <div className="flex-1 h-0.5 bg-gray-200 max-w-8" />}
          </React.Fragment>
        ))}
      </div>

      <main className="flex-1 p-4">
        <div className="max-w-2xl mx-auto space-y-4">
          {/* 안내 */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <div className="text-2xl">💬</div>
              <div>
                <h2 className="text-sm font-bold text-indigo-800 mb-1">토론 문제</h2>
                <p className="text-xs text-indigo-600">
                  아래 질문에 대해 생각해 보고 답을 작성하세요.
                  답변은 자동으로 저장되며, 선생님과 함께 토론합니다.
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <div className="flex-1 h-2 bg-indigo-200 rounded-full">
                <div
                  className="h-2 bg-indigo-500 rounded-full transition-all"
                  style={{ width: `${(answeredCount / DISCUSSION_QUESTIONS.length) * 100}%` }}
                />
              </div>
              <span className="text-xs text-indigo-600 font-medium">
                {answeredCount} / {DISCUSSION_QUESTIONS.length}
              </span>
            </div>
          </div>

          {/* 질문 카드들 */}
          {DISCUSSION_QUESTIONS.map((q, idx) => {
            const answered = answers[q.id]?.trim()
            return (
              <div
                key={q.id}
                className={`bg-white rounded-2xl p-4 shadow-sm border transition-colors ${answered ? 'border-indigo-200' : 'border-gray-200'}`}
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${answered ? 'bg-indigo-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                    {answered ? '✓' : idx + 1}
                  </div>
                  <p className="text-sm text-gray-800 font-medium leading-relaxed">{q.text}</p>
                </div>
                <textarea
                  value={answers[q.id] || ''}
                  onChange={e => handleChange(q.id, e.target.value)}
                  placeholder="답을 입력하세요..."
                  rows={3}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent resize-none transition-colors"
                />
              </div>
            )
          })}

          {/* 완료 버튼 */}
          <button
            onClick={handleFinish}
            className="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-lg transition-all shadow-lg hover:shadow-xl"
          >
            실험 완료 — 처음으로 돌아가기
          </button>
        </div>
      </main>
    </div>
  )
}
