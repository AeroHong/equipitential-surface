import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from '../../firebase.js'
import { useAuth } from '../../App.jsx'
import { createSession, getStudentSessions, getDiscussionRecord, deleteSession } from '../../services/firebase.js'
import ExperimentGuideModal from '../../components/ExperimentGuideModal.jsx'

const EXPERIMENTS = [
  {
    id: 'point_electrode',
    title: '실험 1 — 점전극',
    subtitle: '두 점전하에 의한 전기장',
    description: '격자 좌상단과 우하단에 핀형 점전극을 배치합니다. 쌍극자 형태의 등전위면이 형성됩니다.',
    details: [
      '점전극 (핀 2개)',
      '전극 위치: 격자 좌상단(+) / 우하단(−)',
      '예상 등전위선: 동심원 형태',
    ],
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <circle cx="6" cy="6" r="3" strokeWidth={2} stroke="#ef4444" fill="#fef2f2" />
        <circle cx="18" cy="18" r="3" strokeWidth={2} stroke="#6366f1" fill="#eef2ff" />
        <path strokeLinecap="round" strokeWidth={1.5} strokeDasharray="3 2" d="M8.1 8.1 L15.9 15.9" />
      </svg>
    ),
    electrodeConfig: {
      type: 'point_electrode',
      positive: { x: -0.5, y: -0.5 },
      negative: { x: 7.5, y: 7.5 }
    },
    accentClass: 'bg-red-600 hover:bg-red-700',
    borderClass: 'border-red-200',
    badgeClass: 'bg-red-100 text-red-700',
    bgClass: 'bg-red-50',
  },
  {
    id: 'line_electrode',
    title: '실험 2 — 선전극',
    subtitle: '평행 선전하에 의한 전기장',
    description: '격자 상단과 하단에 막대형 선전극을 수평으로 배치합니다. 평행한 균일 전기장이 형성됩니다.',
    details: [
      '선전극 (막대 or 긴 와이어)',
      '전극 위치: 격자 상단(+) / 하단(−)',
      '예상 등전위선: 평행선 형태',
    ],
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <rect x="3" y="4" width="18" height="3" rx="1.5" strokeWidth={2} stroke="#ef4444" fill="#fef2f2" />
        <rect x="3" y="17" width="18" height="3" rx="1.5" strokeWidth={2} stroke="#6366f1" fill="#eef2ff" />
        <path strokeLinecap="round" strokeWidth={1.5} d="M12 8 L12 16" />
        <path strokeLinecap="round" strokeWidth={1} strokeDasharray="2 2" d="M7 8 L7 16 M17 8 L17 16" />
      </svg>
    ),
    electrodeConfig: {
      type: 'line_electrode',
      positive: { x: 3.5, y: -0.5 },
      negative: { x: 3.5, y: 7.5 }
    },
    accentClass: 'bg-amber-600 hover:bg-amber-700',
    borderClass: 'border-amber-200',
    badgeClass: 'bg-amber-100 text-amber-700',
    bgClass: 'bg-amber-50',
  }
]

function formatDateTime(ts) {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function getStepLabel(step) {
  if (step >= 3) return '완료'
  return 'Step 1: 데이터 입력 중'
}

function getResumeUrl(session) {
  if (session.step >= 3) return `/student/session/${session.id}/step3`
  return `/student/session/${session.id}/step1`
}

export default function ExperimentSelect() {
  const navigate = useNavigate()
  const { user, userInfo } = useAuth()
  const [sessions, setSessions]               = useState([])
  const [discussionRecord, setDiscussionRecord] = useState(null)
  const [creating, setCreating]               = useState(null)
  const [deleting, setDeleting]               = useState(null) // sessionId being deleted
  const [loading, setLoading]                 = useState(true)
  const [showGuideModal, setShowGuideModal]   = useState(false)

  useEffect(() => {
    if (userInfo !== undefined && userInfo !== null && !userInfo.name) {
      navigate('/student/profile', { replace: true })
    }
  }, [userInfo, navigate])

  useEffect(() => {
    if (!user) return
    // getDiscussionRecord는 신규 컬렉션 — 권한 오류 시 기본값으로 처리
    Promise.all([
      getStudentSessions(user.uid),
      getDiscussionRecord(user.uid).catch(() => ({ answers: {}, completed: false })),
    ]).then(([ss, rec]) => {
      setSessions(ss)
      setDiscussionRecord(rec)
    }).catch(err => {
      console.error('세션 로딩 실패:', err)
    }).finally(() => setLoading(false))
  }, [user])

  async function handleNewExperiment(exp) {
    if (creating) return
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

  async function handleDeleteSession(sessionId, label) {
    if (!window.confirm(`"${label}" 데이터를 삭제할까요?\n삭제하면 복구할 수 없습니다.`)) return
    setDeleting(sessionId)
    try {
      await deleteSession(sessionId)
      setSessions(prev => prev.filter(s => s.id !== sessionId))
    } catch (err) {
      console.error('삭제 실패:', err)
      alert('삭제에 실패했습니다.')
    } finally {
      setDeleting(null)
    }
  }

  async function handleLogout() {
    await signOut(auth)
    navigate('/login')
  }

  const pointSessions = sessions.filter(s => s.experimentType === 'point_electrode')
  const lineSessions  = sessions.filter(s => s.experimentType === 'line_electrode')
  const pointDone     = pointSessions.some(s => s.step >= 3)
  const lineDone      = lineSessions.some(s => s.step >= 3)
  const canDiscuss    = pointDone && lineDone
  const discussionDone = discussionRecord?.completed === true

  const sessionsByType = {
    point_electrode: pointSessions,
    line_electrode:  lineSessions,
  }

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
            onClick={() => setShowGuideModal(true)}
            className="text-xs text-indigo-600 border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-50 transition-colors hidden sm:block"
          >
            실험 준비 안내
          </button>
          <button
            onClick={handleLogout}
            className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
          >
            로그아웃
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* 전체 진행 현황 */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
          <h2 className="text-sm font-bold text-gray-700 mb-3">실험 진행 현황</h2>
          <div className="flex items-center gap-1">
            {[
              { label: '실험 1\n점전극', done: pointDone },
              { label: '실험 2\n선전극', done: lineDone },
              { label: '토론', done: discussionDone },
            ].map((item, idx, arr) => (
              <React.Fragment key={idx}>
                <div className="flex flex-col items-center gap-1 flex-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                    item.done ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {item.done ? '✓' : idx + 1}
                  </div>
                  <span className="text-xs text-center text-gray-500 whitespace-pre-line leading-tight">{item.label}</span>
                </div>
                {idx < arr.length - 1 && (
                  <div className={`flex-none h-0.5 w-8 mb-4 ${item.done ? 'bg-green-400' : 'bg-gray-200'}`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* 실험 섹션 */}
        {EXPERIMENTS.map(exp => {
          const expSessions = sessionsByType[exp.id]
          const isDone = expSessions.some(s => s.step >= 3)

          return (
            <div key={exp.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

              {/* 섹션 헤더 */}
              <div className={`px-5 py-4 ${exp.bgClass} border-b ${exp.borderClass}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex-shrink-0">{exp.icon}</div>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="text-base font-bold text-gray-900">{exp.title}</h3>
                        {isDone && (
                          <span className="text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">완료됨</span>
                        )}
                      </div>
                      <p className="text-xs font-medium text-gray-600 mb-1">{exp.subtitle}</p>
                      <p className="text-xs text-gray-500 leading-relaxed">{exp.description}</p>
                    </div>
                  </div>
                </div>
                {/* 상세 태그 */}
                <div className="flex flex-wrap gap-1.5 mt-3 ml-11">
                  {exp.details.map((d, i) => (
                    <span key={i} className={`text-xs px-2 py-0.5 rounded-full font-medium ${exp.badgeClass}`}>
                      {d}
                    </span>
                  ))}
                </div>
              </div>

              {/* 새 실험 시작 */}
              <div className="px-5 py-3 border-b border-gray-100">
                <button
                  onClick={() => handleNewExperiment(exp)}
                  disabled={creating !== null}
                  className={`w-full py-2.5 rounded-xl text-white font-semibold text-sm transition-all shadow-sm ${exp.accentClass} disabled:opacity-60 disabled:cursor-not-allowed`}
                >
                  {creating === exp.id ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      세션 생성 중...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-1.5">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      새 실험 시작
                    </span>
                  )}
                </button>
              </div>

              {/* 이전 실험 이어하기 */}
              <div className="px-5 py-3">
                {loading ? (
                  <div className="flex justify-center py-2">
                    <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : expSessions.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-1">아직 진행한 실험이 없습니다.</p>
                ) : (
                  <>
                    <p className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">이전 실험 이어하기</p>
                    <div className="space-y-1.5">
                      {expSessions.map((session, idx) => {
                        const done = session.step >= 3
                        const label = `${exp.title.split(' — ')[0]} 실험 ${expSessions.length - idx}차`
                        const isDeleting = deleting === session.id
                        return (
                          <div key={session.id} className="flex items-center gap-1.5">
                            {/* 세션 정보 + 이동 버튼 */}
                            <div className="flex-1 min-w-0 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-semibold text-gray-800 truncate">{label}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                                  done ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                                }`}>
                                  {getStepLabel(session.step)}
                                </span>
                              </div>
                              <p className="text-xs text-gray-400 mb-2">
                                측정 {session.measurements?.length || 0}/64개 · {formatDateTime(session.updatedAt)}
                              </p>
                              {/* 이동 버튼들 */}
                              <div className="flex gap-1.5">
                                <button
                                  onClick={() => navigate(`/student/session/${session.id}/step1`)}
                                  disabled={isDeleting}
                                  className="flex-1 py-1.5 rounded-lg bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-xs font-medium text-gray-700 hover:text-blue-700 transition-colors disabled:opacity-50"
                                >
                                  {done ? '데이터 확인 / 수정' : '이어하기 →'}
                                </button>
                                {done && (
                                  <button
                                    onClick={() => navigate(`/student/session/${session.id}/step3`)}
                                    disabled={isDeleting}
                                    className="flex-1 py-1.5 rounded-lg bg-white border border-green-200 hover:border-green-400 hover:bg-green-50 text-xs font-medium text-green-700 transition-colors disabled:opacity-50"
                                  >
                                    3D 결과 보기
                                  </button>
                                )}
                              </div>
                            </div>
                            {/* 삭제 버튼 */}
                            <button
                              onClick={() => handleDeleteSession(session.id, label)}
                              disabled={isDeleting}
                              className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl border border-red-100 text-red-400 hover:bg-red-50 hover:text-red-600 hover:border-red-300 transition-colors disabled:opacity-40"
                              title="삭제"
                            >
                              {isDeleting ? (
                                <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              )}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>

            </div>
          )
        })}

        {/* 토론 단계 */}
        <div className={`rounded-2xl border shadow-sm overflow-hidden transition-opacity ${canDiscuss ? 'bg-white border-indigo-200' : 'bg-gray-50 border-gray-200'}`}>
          <div className="px-5 py-4 bg-indigo-50 border-b border-indigo-100 flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-base">💬</span>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-gray-900">토론 단계</h3>
                {discussionDone && (
                  <span className="text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">완료됨</span>
                )}
              </div>
              <p className="text-xs text-gray-500">두 실험 완료 후 진행 · 두 실험 결과 비교 및 토론 문제</p>
            </div>
          </div>
          <div className="px-5 py-4">
            {!canDiscuss && (
              <p className="text-xs text-gray-400 text-center mb-3">
                실험 1과 실험 2를 모두 완료해야 토론에 참여할 수 있습니다.
              </p>
            )}
            <button
              onClick={() => navigate('/student/discussion')}
              disabled={!canDiscuss}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                {discussionDone ? '토론 답변 수정하기' : '토론 단계로 이동'}
              </span>
            </button>
          </div>
        </div>

      </main>

      {showGuideModal && <ExperimentGuideModal onClose={() => setShowGuideModal(false)} />}
    </div>
  )
}
