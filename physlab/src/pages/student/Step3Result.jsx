import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Surface3D from '../../components/Surface3D.jsx'
import EquipotentialMap from '../../components/EquipotentialMap.jsx'
import FieldLineCanvas from '../../components/FieldLineCanvas.jsx'
import { getSession, deserializeLines } from '../../services/firebase.js'

export default function Step3Result() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [chartWidth, setChartWidth] = useState(600)

  useEffect(() => {
    getSession(sessionId).then(s => {
      if (!s) { navigate('/student'); return }
      setSession(s)
      setLoading(false)
    })
  }, [sessionId])

  useEffect(() => {
    function updateSize() {
      setChartWidth(Math.min(window.innerWidth - 32, 700))
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
  const drawnLines   = deserializeLines(session?.drawnLines || [])
  const EXP_LABEL = session?.experimentType === 'line_electrode' ? '실험 2 — 선전극' : '실험 1 — 점전극'

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shadow-sm">
        <button
          onClick={() => navigate('/student')}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-base font-bold text-gray-900">{EXP_LABEL}</h1>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-green-100 text-green-700 rounded-full px-2 py-0.5 font-medium">Step 2</span>
            <span className="text-xs text-gray-500">3D 결과</span>
          </div>
        </div>
      </header>

      {/* 2단계 진행 표시 */}
      <div className="bg-white border-b border-gray-100 px-4 py-2 flex items-center gap-2">
        {[
          { n: 1, label: '데이터 입력' },
          { n: 2, label: '3D 결과' },
        ].map(({ n, label }, idx, arr) => (
          <React.Fragment key={n}>
            <div className={`flex items-center gap-1.5 text-xs font-medium ${n <= 2 ? 'text-green-600' : 'text-gray-400'}`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                n < 2 ? 'bg-green-500 text-white' : 'bg-green-600 text-white'
              }`}>
                {n < 2 ? '✓' : n}
              </div>
              <span className="hidden sm:inline">{label}</span>
            </div>
            {idx < arr.length - 1 && <div className="flex-1 h-0.5 bg-green-200 max-w-8" />}
          </React.Fragment>
        ))}
      </div>

      <main className="flex-1 p-4 overflow-x-hidden">
        <div className="max-w-3xl mx-auto space-y-6">

          {/* 완료 배너 */}
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl p-5 text-white shadow-lg">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white bg-opacity-20 rounded-xl flex items-center justify-center text-2xl">📊</div>
              <div>
                <h2 className="text-lg font-bold">데이터 분석 완료!</h2>
                <p className="text-green-100 text-sm mt-0.5">{EXP_LABEL} — 아래에서 3D 전위 분포를 확인하세요.</p>
              </div>
            </div>
          </div>

          {/* 3D 지형도 */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200">
            <h2 className="text-base font-bold text-gray-800 mb-1">3D 전위 지형도</h2>
            <p className="text-xs text-gray-500 mb-4">마우스로 드래그하여 회전, 스크롤로 확대/축소할 수 있습니다.</p>
            <div className="overflow-x-auto">
              <Surface3D
                measurements1={measurements}
                measurements2={null}
                title1={EXP_LABEL}
                title2={null}
                width={Math.min(chartWidth, 600)}
                height={420}
              />
            </div>
          </div>

          {/* 2D 등전위선 + 전기력선 */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200">
            <h2 className="text-base font-bold text-gray-800 mb-4">등전위선 & 전기력선 지도</h2>
            <div className="flex flex-wrap justify-center gap-6">
              <div className="flex flex-col items-center gap-2">
                <p className="text-xs font-medium text-gray-500">등전위선</p>
                <EquipotentialMap
                  measurements={measurements}
                  electrodeConfig={session?.electrodeConfig}
                  width={260}
                  height={260}
                  levels={20}
                />
              </div>
              <div className="flex flex-col items-center gap-2">
                <p className="text-xs font-medium text-gray-500">전기력선 (자동 생성)</p>
                <FieldLineCanvas
                  measurements={measurements}
                  drawnLines={drawnLines}
                  electrodeConfig={session?.electrodeConfig}
                  width={260}
                  height={260}
                  readOnly
                />
              </div>
            </div>
          </div>

          {/* 요약 카드 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 text-center">
              <p className="text-xs text-gray-500 mb-1">측정 포인트</p>
              <p className="text-2xl font-black text-blue-600">{measurements.length}</p>
              <p className="text-xs text-gray-400">/ 64</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 text-center">
              <p className="text-xs text-gray-500 mb-1">등전위선 레벨</p>
              <p className="text-2xl font-black text-green-600">20</p>
              <p className="text-xs text-gray-400">단계</p>
            </div>
          </div>

          {/* 버튼 */}
          <div className="flex gap-3">
            <button
              onClick={() => navigate(`/student/session/${sessionId}/step1`)}
              className="flex-1 py-3.5 rounded-2xl bg-white border-2 border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-gray-700 hover:text-blue-700 font-bold text-base transition-all"
            >
              ← 데이터 확인 / 수정
            </button>
            <button
              onClick={() => navigate('/student')}
              className="flex-1 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-base transition-all shadow-lg hover:shadow-xl"
            >
              홈으로
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
