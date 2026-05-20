import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Surface3D from '../../components/Surface3D.jsx'
import EquipotentialMap from '../../components/EquipotentialMap.jsx'
import { getSession, getStudentSessions } from '../../services/firebase.js'
import { useAuth } from '../../App.jsx'

export default function Step3Result() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [session, setSession] = useState(null)
  const [otherSession, setOtherSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [chartWidth, setChartWidth] = useState(700)

  useEffect(() => {
    async function load() {
      const s = await getSession(sessionId)
      if (!s) { navigate('/student'); return }
      setSession(s)

      // 다른 실험 타입의 세션 찾기 (비교용)
      if (user) {
        const allSessions = await getStudentSessions(user.uid)
        const otherType = s.experimentType === 'point_electrode' ? 'line_electrode' : 'point_electrode'
        const other = allSessions.find(
          ss => ss.id !== sessionId && ss.experimentType === otherType && ss.step >= 3
        )
        if (other) setOtherSession(other)
      }

      setLoading(false)
    }
    load()
  }, [sessionId, user])

  // 반응형 차트 크기
  useEffect(() => {
    function updateSize() {
      const w = Math.min(window.innerWidth - 32, 900)
      setChartWidth(w)
    }
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const measurements = session?.measurements || []
  const otherMeasurements = otherSession?.measurements || []
  const hasComparison = otherMeasurements.length >= 3

  const EXP_LABEL = session?.experimentType === 'line_electrode' ? '실험 2 — 선전극' : '실험 1 — 점전극'
  const EXP_LABEL_OTHER = otherSession?.experimentType === 'line_electrode' ? '실험 2 — 선전극' : '실험 1 — 점전극'

  const scoreColor =
    session?.score >= 80 ? 'text-green-600' :
    session?.score >= 60 ? 'text-yellow-600' :
    session?.score !== null ? 'text-red-600' : 'text-gray-400'

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shadow-sm">
        <button
          onClick={() => navigate(`/student/session/${sessionId}/step2`)}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-base font-bold text-gray-900">{EXP_LABEL}</h1>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-green-100 text-green-700 rounded-full px-2 py-0.5 font-medium">Step 3</span>
            <span className="text-xs text-gray-500">3D 결과</span>
          </div>
        </div>
        {session?.score !== null && session?.score !== undefined && (
          <div className="ml-auto text-right">
            <p className="text-xs text-gray-500">전기력선 점수</p>
            <p className={`text-xl font-black ${scoreColor}`}>{session.score}점</p>
          </div>
        )}
      </header>

      {/* 진행 단계 표시 */}
      <div className="bg-white border-b border-gray-100 px-4 py-2 flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <React.Fragment key={s}>
            <div className={`flex items-center gap-1.5 text-xs font-medium ${s === 3 ? 'text-green-600' : 'text-green-600'}`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${s === 3 ? 'bg-green-600 text-white' : 'bg-green-500 text-white'}`}>
                ✓
              </div>
              {s === 1 ? '데이터 입력' : s === 2 ? '전기력선' : '3D 결과'}
            </div>
            {s < 3 && <div className="flex-1 h-0.5 bg-green-200 max-w-12" />}
          </React.Fragment>
        ))}
      </div>

      <main className="flex-1 p-4 overflow-x-hidden">
        <div className="max-w-5xl mx-auto space-y-6">

          {/* 완료 배너 */}
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl p-5 text-white shadow-lg">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white bg-opacity-20 rounded-xl flex items-center justify-center text-2xl">
                🎉
              </div>
              <div>
                <h2 className="text-lg font-bold">실험 완료!</h2>
                <p className="text-green-100 text-sm mt-0.5">
                  {EXP_LABEL} 데이터 분석이 완료되었습니다.
                  {session?.score !== null && ` 전기력선 수직도: ${session.score}점`}
                </p>
              </div>
            </div>
          </div>

          {/* 3D 지형도 */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200">
            <h2 className="text-base font-bold text-gray-800 mb-1">3D 전위 지형도</h2>
            <p className="text-xs text-gray-500 mb-4">
              마우스로 드래그하여 회전하고, 스크롤로 확대/축소할 수 있습니다.
            </p>
            <div className="overflow-x-auto">
              <Surface3D
                measurements1={measurements}
                measurements2={hasComparison ? otherMeasurements : null}
                title1={EXP_LABEL}
                title2={EXP_LABEL_OTHER}
                width={hasComparison ? Math.min(chartWidth, 900) : Math.min(chartWidth, 600)}
                height={420}
              />
            </div>
            {!hasComparison && (
              <p className="text-xs text-gray-400 mt-3 text-center">
                다른 실험(
                {session?.experimentType === 'point_electrode' ? '선전극' : '점전극'}
                )을 완료하면 나란히 비교할 수 있습니다.
              </p>
            )}
          </div>

          {/* 2D 등전위선 비교 */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200">
            <h2 className="text-base font-bold text-gray-800 mb-4">등전위선 지도</h2>
            <div className={`grid gap-4 ${hasComparison ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
              <div className="flex flex-col items-center gap-2">
                <p className="text-sm font-medium text-gray-600">{EXP_LABEL}</p>
                <EquipotentialMap
                  measurements={measurements}
                  electrodeConfig={session?.electrodeConfig}
                  width={260}
                  height={260}
                  levels={12}
                />
              </div>
              {hasComparison && (
                <div className="flex flex-col items-center gap-2">
                  <p className="text-sm font-medium text-gray-600">{EXP_LABEL_OTHER}</p>
                  <EquipotentialMap
                    measurements={otherMeasurements}
                    electrodeConfig={otherSession?.electrodeConfig}
                    width={260}
                    height={260}
                    levels={12}
                  />
                </div>
              )}
            </div>
          </div>

          {/* 요약 카드 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 text-center">
              <p className="text-xs text-gray-500 mb-1">측정 포인트</p>
              <p className="text-2xl font-black text-blue-600">{measurements.length}</p>
              <p className="text-xs text-gray-400">/ 64</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 text-center">
              <p className="text-xs text-gray-500 mb-1">전기력선 수</p>
              <p className="text-2xl font-black text-purple-600">{session?.drawnLines?.length || 0}</p>
              <p className="text-xs text-gray-400">개</p>
            </div>
            <div className={`bg-white rounded-xl p-4 shadow-sm border border-gray-200 text-center col-span-2 sm:col-span-1`}>
              <p className="text-xs text-gray-500 mb-1">수직도 점수</p>
              <p className={`text-2xl font-black ${scoreColor}`}>
                {session?.score !== null && session?.score !== undefined ? session.score : '—'}
              </p>
              <p className="text-xs text-gray-400">/ 100점</p>
            </div>
          </div>

          {/* 홈으로 버튼 */}
          <button
            onClick={() => navigate('/student')}
            className="w-full py-4 rounded-2xl border-2 border-blue-200 text-blue-600 font-bold text-base hover:bg-blue-50 transition-colors"
          >
            실험 선택 화면으로 돌아가기
          </button>
        </div>
      </main>
    </div>
  )
}
