import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import FieldLineCanvas from '../../components/FieldLineCanvas.jsx'
import { getSession, saveDrawingResult, saveDrawingLines, deserializeLines } from '../../services/firebase.js'

const CANVAS_SIZE = 350

export default function Step2Drawing() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const [session, setSession] = useState(null)
  const [drawnLines, setDrawnLines] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showGuide, setShowGuide] = useState(true)
  const [autoSaveStatus, setAutoSaveStatus] = useState('idle')

  const debounceTimer  = useRef(null)
  const drawnLinesRef  = useRef([])

  useEffect(() => {
    getSession(sessionId).then((s) => {
      if (!s) { navigate('/student'); return }
      setSession(s)
      if (s.drawnLines && s.drawnLines.length > 0) {
        const loaded = deserializeLines(s.drawnLines)
        setDrawnLines(loaded)
        drawnLinesRef.current = loaded
      }
      // 이미 제출된 세션이면 step3로
      if (s.step >= 3) {
        navigate(`/student/session/${sessionId}/step3`, { replace: true })
        return
      }
      setLoading(false)
    })
  }, [sessionId])

  // 자동저장 (2초 debounce)
  useEffect(() => {
    if (loading) return
    if (drawnLines.length === 0) return

    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    setAutoSaveStatus('saving')

    debounceTimer.current = setTimeout(async () => {
      try {
        await saveDrawingLines(sessionId, drawnLines)
        setAutoSaveStatus('saved')
        setTimeout(() => setAutoSaveStatus('idle'), 3000)
      } catch (err) {
        console.error('자동저장 실패:', err)
        setAutoSaveStatus('idle')
      }
    }, 2000)

    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current) }
  }, [drawnLines, loading, sessionId])

  useEffect(() => {
    drawnLinesRef.current = drawnLines
  }, [drawnLines])

  useEffect(() => {
    function handleBeforeUnload() {
      if (drawnLinesRef.current.length > 0) {
        saveDrawingLines(sessionId, drawnLinesRef.current).catch(() => {})
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [sessionId])

  async function handleSubmit() {
    if (drawnLines.length === 0) {
      alert('전기력선을 최소 1개 이상 그려주세요.')
      return
    }

    // 자동저장 타이머 취소 (동시 쓰기 방지)
    if (debounceTimer.current) clearTimeout(debounceTimer.current)

    // 좌표 유효성 검사 (Firestore는 NaN/Infinity 허용 안 함)
    const cleanLines = drawnLines
      .map(line => line.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y)))
      .filter(line => line.length > 1)

    if (cleanLines.length === 0) {
      alert('유효한 전기력선이 없습니다. 다시 그려주세요.')
      return
    }

    setSubmitting(true)
    try {
      await saveDrawingResult(sessionId, cleanLines)
      navigate(`/student/session/${sessionId}/step3`)
    } catch (err) {
      console.error('제출 오류:', err)
      alert(`제출 오류: ${err?.message || err?.code || String(err)}`)
      setSubmitting(false)
    }
  }

  function handleUndo() {
    setDrawnLines(prev => prev.slice(0, -1))
  }

  function handleClear() {
    setDrawnLines([])
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const EXP_LABEL = session?.experimentType === 'line_electrode' ? '실험 2 — 선전극' : '실험 1 — 점전극'

  function AutoSaveBadge() {
    if (autoSaveStatus === 'saving') {
      return (
        <div className="flex items-center gap-1.5 text-xs text-amber-600">
          <div className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          저장 중...
        </div>
      )
    }
    if (autoSaveStatus === 'saved') {
      return (
        <div className="flex items-center gap-1 text-xs text-green-600">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          저장됨
        </div>
      )
    }
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shadow-sm">
        <button
          onClick={() => navigate(`/student/session/${sessionId}/step1`)}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-base font-bold text-gray-900">{EXP_LABEL}</h1>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-purple-100 text-purple-700 rounded-full px-2 py-0.5 font-medium">Step 2</span>
            <span className="text-xs text-gray-500">전기력선 그리기</span>
          </div>
        </div>
        <div className="ml-auto">
          <AutoSaveBadge />
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
            <div className={`flex items-center gap-1.5 text-xs font-medium ${n === 2 ? 'text-purple-600' : n < 2 ? 'text-green-600' : 'text-gray-400'}`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${n === 2 ? 'bg-purple-600 text-white' : n < 2 ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                {n < 2 ? '✓' : n}
              </div>
              <span className="hidden sm:inline">{label}</span>
            </div>
            {idx < arr.length - 1 && <div className="flex-1 h-0.5 bg-gray-200 max-w-8" />}
          </React.Fragment>
        ))}
      </div>

      <main className="flex-1 p-4">
        <div className="flex flex-col lg:flex-row gap-6 max-w-5xl mx-auto">
          {/* 캔버스 영역 */}
          <div className="flex-shrink-0">
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
              <h2 className="text-sm font-semibold text-gray-700 mb-1">전기력선 드로잉</h2>
              <p className="text-xs text-gray-400 mb-3">
                손가락 또는 마우스로 등전위선과 수직인 방향으로 그리세요.
              </p>

              <FieldLineCanvas
                measurements={session?.measurements || []}
                drawnLines={drawnLines}
                onDraw={setDrawnLines}
                width={CANVAS_SIZE}
                height={CANVAS_SIZE}
                electrodeConfig={session?.electrodeConfig}
              />

              {/* 캔버스 아래 버튼 */}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleUndo}
                  disabled={drawnLines.length === 0}
                  className="px-3 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title="마지막 선 취소"
                >
                  ↩ 되돌리기
                </button>
                <button
                  onClick={handleClear}
                  disabled={drawnLines.length === 0}
                  className="px-3 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-red-50 hover:border-red-200 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  전체 초기화
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={drawnLines.length === 0 || submitting}
                  className="flex-grow py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      저장 중...
                    </span>
                  ) : (
                    '제출 완료 →'
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* 오른쪽 패널 */}
          <div className="flex-1 flex flex-col gap-4">
            {/* 그린 선 현황 */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 font-medium">그린 선 수</span>
                <span className="text-3xl font-black text-purple-600">{drawnLines.length}</span>
              </div>
              <div className="mt-3 h-2 bg-gray-100 rounded-full">
                <div
                  className="h-2 bg-purple-500 rounded-full transition-all"
                  style={{ width: `${Math.min(100, (drawnLines.length / 8) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1.5">권장: 8개 이상</p>

              {/* 선별 삭제 */}
              {drawnLines.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-500 mb-2">선 개별 삭제</p>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                    {drawnLines.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => setDrawnLines(prev => prev.filter((_, i) => i !== idx))}
                        className="flex items-center gap-1 text-xs bg-purple-50 hover:bg-red-50 border border-purple-200 hover:border-red-300 text-purple-700 hover:text-red-600 rounded-lg px-2 py-1 transition-colors"
                      >
                        선 {idx + 1} ✕
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 드로잉 가이드 */}
            {showGuide && (
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-sm font-bold text-blue-800">드로잉 안내</h3>
                  <button onClick={() => setShowGuide(false)} className="text-blue-400 hover:text-blue-600 text-xs">닫기</button>
                </div>
                <ul className="text-xs text-blue-700 space-y-1.5">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400 mt-0.5">•</span>
                    전기력선은 등전위선과 <strong>수직(90°)</strong>으로 교차해야 합니다.
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400 mt-0.5">•</span>
                    <strong>양극(+)</strong>에서 출발하여 <strong>음극(−)</strong>으로 향하도록 그리세요.
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400 mt-0.5">•</span>
                    여러 방향으로 <strong>균등하게</strong> 분포시키세요.
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400 mt-0.5">•</span>
                    잘못 그린 선은 <strong>되돌리기</strong> 또는 <strong>선 개별 삭제</strong>로 지우세요.
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
