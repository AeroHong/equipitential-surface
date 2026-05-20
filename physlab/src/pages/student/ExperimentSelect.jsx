import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from '../../firebase.js'
import { useAuth } from '../../App.jsx'
import { createSession, getStudentSessions } from '../../services/firebase.js'
import ExperimentGuideModal from '../../components/ExperimentGuideModal.jsx'

const EXPERIMENTS = [
  {
    id: 'point_electrode',
    title: '실험 1 — 점전극',
    subtitle: '두 점전하에 의한 전기장',
    description: '격자 좌상단과 우하단에 핀형 점전극을 배치합니다. 쌍극자 형태의 등전위면이 형성됩니다.',
    details: [
      '점전극 (핀 2개)',
      '전극 위치: 격자 좌상단 외부(+) / 우하단 외부(−)',
      '예상 등전위선: 동심원 형태',
    ],
    icon: (
      <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <circle cx="6" cy="6" r="3" strokeWidth={2} stroke="#ef4444" fill="#fef2f2" />
        <circle cx="18" cy="18" r="3" strokeWidth={2} stroke="#6366f1" fill="#eef2ff" />
        <path strokeLinecap="round" strokeWidth={1.5} strokeDasharray="3 2" d="M8.1 8.1 L15.9 15.9" />
      </svg>
    ),
    electrodeConfig: {
      type: 'point_electrode',
      positive: { x: -0.5, y: -0.5 },   // 격자 좌상단 외부
      negative: { x: 7.5, y: 7.5 }      // 격자 우하단 외부
    },
    color: 'from-red-50 to-indigo-50',
    border: 'border-red-200 hover:border-red-400',
    badgeColor: 'bg-red-100 text-red-700',
  },
  {
    id: 'line_electrode',
    title: '실험 2 — 선전극',
    subtitle: '평행 선전하에 의한 전기장',
    description: '격자 상단과 하단에 막대형 선전극을 수평으로 배치합니다. 평행한 균일 전기장이 형성됩니다.',
    details: [
      '선전극 (막대 or 긴 와이어)',
      '전극 위치: 격자 상단 외부(+) / 하단 외부(−)',
      '예상 등전위선: 평행선 형태',
    ],
    icon: (
      <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <rect x="3" y="4" width="18" height="3" rx="1.5" strokeWidth={2} stroke="#ef4444" fill="#fef2f2" />
        <rect x="3" y="17" width="18" height="3" rx="1.5" strokeWidth={2} stroke="#6366f1" fill="#eef2ff" />
        <path strokeLinecap="round" strokeWidth={1.5} d="M12 8 L12 16" />
        <path strokeLinecap="round" strokeWidth={1} strokeDasharray="2 2" d="M7 8 L7 16 M17 8 L17 16" />
      </svg>
    ),
    electrodeConfig: {
      type: 'line_electrode',
      positive: { x: 3.5, y: -0.5 },  // 격자 상단 외부 (중앙)
      negative: { x: 3.5, y: 7.5 }   // 격자 하단 외부 (중앙)
    },
    color: 'from-amber-50 to-blue-50',
    border: 'border-amber-200 hover:border-amber-400',
    badgeColor: 'bg-amber-100 text-amber-700',
  }
]

export default function ExperimentSelect() {
  const navigate = useNavigate()
  const { user, userInfo } = useAuth()
  const [sessions, setSessions] = useState([])
  const [creating, setCreating] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showGuideModal, setShowGuideModal] = useState(false)

  // 이름이 없으면 프로필 설정으로 이동
  useEffect(() => {
    if (userInfo !== undefined && userInfo !== null && !userInfo.name) {
      navigate('/student/profile', { replace: true })
    }
  }, [userInfo, navigate])

  useEffect(() => {
    if (!user) return
    getStudentSessions(user.uid)
      .then(setSessions)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [user])

  async function handleSelectExperiment(exp) {
    if (creating) return
    // 미완료(step < 4) 세션이 이미 있으면 기존 세션으로 이동
    const existing = sessions.find(s => s.experimentType === exp.id && s.step < 4)
    if (existing) {
      navigate(`/student/session/${existing.id}/step${existing.step}`)
      return
    }
    setCreating(exp.id)
    try {
      const sessionId = await createSession(user.uid, exp.id, exp.electrodeConfig)
      navigate(`/student/session/${sessionId}/step1`)
    } catch (err) {
      console.error('세션 생성 실패:', err)
      alert('세션 생성에 실패했습니다. 다시 시도해주세요.')
    } finally {
      setCreating(null)
    }
  }

  function resumeSession(sessionId, step) {
    navigate(`/student/session/${sessionId}/step${step}`)
  }

  async function handleLogout() {
    await signOut(auth)
    navigate('/login')
  }

  const STEP_LABELS = {
    1: 'Step 1: 데이터 입력',
    2: 'Step 2: 전기력선 그리기',
    3: 'Step 3: 3D 결과',
    4: '완료 (토론 답변 수정 가능)',
  }
  const EXP_LABELS = { point_electrode: '점전극', line_electrode: '선전극' }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-xs font-bold">PL</span>
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900">PhysLab</h1>
            <p className="text-xs text-gray-500">등전위면 실험</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium text-gray-800">{userInfo?.name || user?.displayName || '학생'}</p>
            <p className="text-xs text-gray-500">{userInfo?.class ? `${userInfo.class}반` : user?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
          >
            로그아웃
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">실험 선택</h2>
            <p className="text-gray-600 mt-1">진행할 실험을 선택하여 새 세션을 시작하세요.</p>
          </div>
          {/* 실험 준비 안내 버튼 */}
          <button
            onClick={() => setShowGuideModal(true)}
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm hover:shadow-md"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            실험 준비 안내
          </button>
        </div>

        {/* 실험 선택 카드 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {EXPERIMENTS.map((exp) => (
            <button
              key={exp.id}
              onClick={() => handleSelectExperiment(exp)}
              disabled={creating !== null}
              className={[
                `bg-gradient-to-br ${exp.color} border-2 ${exp.border}`,
                'rounded-2xl p-6 text-left transition-all duration-200',
                'hover:shadow-md active:scale-98 disabled:opacity-60 disabled:cursor-not-allowed',
                'focus:outline-none focus:ring-2 focus:ring-blue-400'
              ].join(' ')}
            >
              <div className="mb-3">{exp.icon}</div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">{exp.title}</h3>
              <p className="text-sm font-medium text-gray-600 mb-2">{exp.subtitle}</p>
              <p className="text-xs text-gray-500 leading-relaxed mb-3">{exp.description}</p>

              {/* 상세 설명 태그 */}
              <div className="flex flex-col gap-1.5 mb-3">
                {exp.details.map((detail, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <span className="text-gray-300 mt-0.5 text-xs">•</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${exp.badgeColor}`}>
                      {detail}
                    </span>
                  </div>
                ))}
              </div>

              {creating === exp.id && (
                <div className="mt-2 flex items-center gap-2 text-blue-600">
                  <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs">세션 생성 중...</span>
                </div>
              )}

              {creating !== exp.id && (() => {
                const incomplete = sessions.find(s => s.experimentType === exp.id && s.step < 4)
                const isDone = sessions.some(s => s.experimentType === exp.id && s.step >= 4)
                return (
                  <div className="mt-2 flex items-center gap-1 text-blue-600">
                    {isDone && !incomplete && (
                      <span className="text-xs text-green-600 font-semibold bg-green-100 px-2 py-0.5 rounded-full mr-1">완료됨</span>
                    )}
                    <span className="text-sm font-semibold">
                      {incomplete ? '이어서 하기' : '새 실험 시작'}
                    </span>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                )
              })()}
            </button>
          ))}
        </div>

        {/* 이전 세션 목록 */}
        {!loading && sessions.length > 0 && (
          <div>
            <h3 className="text-base font-bold text-gray-700 mb-3">이전 실험 이어하기</h3>
            <div className="space-y-2">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => resumeSession(session.id, session.step)}
                  className="w-full bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50 rounded-xl p-4 text-left flex items-center justify-between transition-colors"
                >
                  <div>
                    <span className="text-sm font-semibold text-gray-800">
                      {EXP_LABELS[session.experimentType] || session.experimentType}
                    </span>
                    <span className={`ml-2 text-xs rounded-full px-2 py-0.5 ${session.step >= 4 ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                      {STEP_LABELS[session.step] || `Step ${session.step}`}
                    </span>
                    <p className="text-xs text-gray-400 mt-1">
                      측정 {session.measurements?.length || 0} / 64개
                    </p>
                  </div>
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        )}

        {loading && (
          <div className="text-center py-4">
            <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        )}
      </main>

      {/* 실험 준비 안내 모달 */}
      {showGuideModal && (
        <ExperimentGuideModal onClose={() => setShowGuideModal(false)} />
      )}
    </div>
  )
}
