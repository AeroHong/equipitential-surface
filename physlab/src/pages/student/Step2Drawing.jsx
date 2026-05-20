import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import FieldLineCanvas from '../../components/FieldLineCanvas.jsx'
import { getSession, saveDrawingResult, saveDrawingLines } from '../../services/firebase.js'
import { idwInterpolate } from '../../services/interpolate.js'
import { computeFieldLines, computePerpendicularScore } from '../../utils/fieldLine.js'
import { computeContours } from '../../utils/equipotential.js'

const RESOLUTION = 50
const CANVAS_SIZE = 350

export default function Step2Drawing() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const [session, setSession] = useState(null)
  const [drawnLines, setDrawnLines] = useState([])
  const [aiLines, setAiLines] = useState([])
  const [score, setScore] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showGuide, setShowGuide] = useState(true)
  const [autoSaveStatus, setAutoSaveStatus] = useState('idle') // 'idle' | 'saving' | 'saved'

  // debounce 타이머 ref
  const debounceTimer = useRef(null)
  // 최신 drawnLines ref (beforeunload용)
  const drawnLinesRef = useRef([])

  useEffect(() => {
    getSession(sessionId).then((s) => {
      if (!s) { navigate('/student'); return }
      setSession(s)
      // 이미 제출된 경우 복원
      if (s.drawnLines && s.drawnLines.length > 0) {
        setDrawnLines(s.drawnLines)
        drawnLinesRef.current = s.drawnLines
      }
      if (s.score !== null && s.score !== undefined) {
        setScore(s.score)
      }
      if (s.step >= 3) {
        setSubmitted(true)
      }
      setLoading(false)
    })
  }, [sessionId])

  // drawnLines 변경 시 debounce 자동저장 (2초) — 미제출 상태에서만
  useEffect(() => {
    if (loading) return
    if (submitted) return
    if (drawnLines.length === 0) return

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
    }

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

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [drawnLines, loading, submitted, sessionId])

  // drawnLines ref 동기화
  useEffect(() => {
    drawnLinesRef.current = drawnLines
  }, [drawnLines])

  // 페이지 이탈 시 마지막 상태 저장
  useEffect(() => {
    function handleBeforeUnload() {
      if (!submitted && drawnLinesRef.current.length > 0) {
        saveDrawingLines(sessionId, drawnLinesRef.current).catch(() => {})
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [sessionId, submitted])

  async function handleSubmit() {
    if (drawnLines.length === 0) {
      alert('전기력선을 최소 1개 이상 그려주세요.')
      return
    }
    setSubmitting(true)
    try {
      const measurements = session.measurements || []
      const grid = idwInterpolate(measurements, RESOLUTION)

      // AI 전기력선 계산
      const computedAiLines = computeFieldLines(
        grid,
        RESOLUTION,
        session.electrodeConfig,
        16
      )
      setAiLines(computedAiLines)

      // 수직도 점수 계산
      const contourData = computeContours(grid, RESOLUTION, 12)
      const computedScore = computePerpendicularScore(
        drawnLines,
        contourData,
        CANVAS_SIZE,
        CANVAS_SIZE
      )
      setScore(computedScore)
      setSubmitted(true)

      // Firestore 저장
      await saveDrawingResult(sessionId, drawnLines, computedScore)
    } catch (err) {
      console.error('제출 오류:', err)
      alert('제출 중 오류가 발생했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleNext() {
    navigate(`/student/session/${sessionId}/step3`)
  }

  function handleClearDrawing() {
    if (submitted) return
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

  function ScoreBadge({ score }) {
    const color =
      score >= 80 ? 'bg-green-100 text-green-700 border-green-200' :
      score >= 60 ? 'bg-yellow-100 text-yellow-700 border-yellow-200' :
                   'bg-red-100 text-red-700 border-red-200'
    const label =
      score >= 80 ? '우수' :
      score >= 60 ? '양호' :
                   '노력 필요'

    return (
      <div className={`border-2 rounded-2xl px-6 py-4 text-center ${color}`}>
        <p className="text-4xl font-black">{score}</p>
        <p className="text-sm font-semibold">점 / 100점</p>
        <p className="text-xs mt-1 font-medium">{label}</p>
      </div>
    )
  }

  // 저장 상태 표시 UI
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
        {/* 자동저장 상태 (미제출 상태에서만) */}
        {!submitted && (
          <div className="ml-auto">
            <AutoSaveBadge />
          </div>
        )}
      </header>

      {/* 진행 단계 표시 */}
      <div className="bg-white border-b border-gray-100 px-4 py-2 flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <React.Fragment key={s}>
            <div className={`flex items-center gap-1.5 text-xs font-medium ${s === 2 ? 'text-purple-600' : s < 2 ? 'text-green-600' : 'text-gray-400'}`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${s === 2 ? 'bg-purple-600 text-white' : s < 2 ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                {s < 2 ? '✓' : s}
              </div>
              {s === 1 ? '데이터 입력' : s === 2 ? '전기력선' : '3D 결과'}
            </div>
            {s < 3 && <div className="flex-1 h-0.5 bg-gray-200 max-w-12" />}
          </React.Fragment>
        ))}
      </div>

      <main className="flex-1 p-4">
        <div className="flex flex-col lg:flex-row gap-6 max-w-5xl mx-auto">
          {/* 캔버스 영역 */}
          <div className="flex-shrink-0">
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
              <h2 className="text-sm font-semibold text-gray-700 mb-1">
                {submitted ? '전기력선 비교 결과' : '전기력선 드로잉'}
              </h2>
              {!submitted && (
                <p className="text-xs text-gray-400 mb-3">
                  손가락 또는 마우스로 등전위선에 수직인 전기력선을 그리세요.
                </p>
              )}

              <FieldLineCanvas
                measurements={session?.measurements || []}
                drawnLines={drawnLines}
                aiLines={aiLines}
                onDraw={setDrawnLines}
                width={CANVAS_SIZE}
                height={CANVAS_SIZE}
                electrodeConfig={session?.electrodeConfig}
                readOnly={submitted}
              />

              {/* 버튼 영역 */}
              {!submitted && (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={handleClearDrawing}
                    disabled={drawnLines.length === 0}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    초기화
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={drawnLines.length === 0 || submitting}
                    className="flex-2 flex-grow py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {submitting ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        AI 계산 중...
                      </span>
                    ) : (
                      '제출 → AI 비교'
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 결과 패널 */}
          <div className="flex-1 flex flex-col gap-4">
            {/* 가이드 (제출 전) */}
            {!submitted && showGuide && (
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
                    잘못 그렸으면 <strong>초기화</strong> 버튼으로 다시 시작하세요.
                  </li>
                </ul>
              </div>
            )}

            {/* 점수 표시 (제출 후) */}
            {submitted && score !== null && (
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200">
                <h3 className="text-sm font-bold text-gray-700 mb-4">수직도 평가 결과</h3>
                <div className="flex items-center gap-4">
                  <ScoreBadge score={score} />
                  <div className="flex-1 text-sm text-gray-600 space-y-2">
                    <p>등전위선과 전기력선이 이루는 각도를 분석했습니다.</p>
                    <p className="text-xs text-gray-400">
                      파란 선: 학생 드로잉<br />
                      빨간 선: AI 계산 정답
                    </p>
                    {score >= 80 && <p className="text-green-600 font-medium text-xs">훌륭합니다! 전기력선을 잘 그렸습니다.</p>}
                    {score >= 60 && score < 80 && <p className="text-yellow-600 font-medium text-xs">양호합니다. AI 정답과 비교해보세요.</p>}
                    {score < 60 && <p className="text-red-600 font-medium text-xs">등전위선과의 수직 관계를 다시 확인해보세요.</p>}
                  </div>
                </div>
              </div>
            )}

            {/* 상태 표시 (드로잉 중) */}
            {!submitted && (
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">그린 선 수</span>
                  <span className="text-2xl font-bold text-purple-600">{drawnLines.length}</span>
                </div>
                <div className="mt-3 h-1.5 bg-gray-100 rounded-full">
                  <div
                    className="h-1.5 bg-purple-500 rounded-full transition-all"
                    style={{ width: `${Math.min(100, (drawnLines.length / 8) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1.5">권장: 8개 이상</p>
              </div>
            )}

            {/* 다음 단계 버튼 */}
            {submitted && (
              <button
                onClick={handleNext}
                className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg transition-all shadow-lg hover:shadow-xl active:scale-98"
              >
                Step 3 — 3D 결과 보기 →
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
