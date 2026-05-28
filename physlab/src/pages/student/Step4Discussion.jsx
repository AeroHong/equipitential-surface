import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../App.jsx'
import {
  getStudentSessions, getDiscussionRecord, saveDiscussionDraft, saveDiscussionFinal,
  getDiscussionQuestions, deserializeLines
} from '../../services/firebase.js'
import Surface3D from '../../components/Surface3D.jsx'
import EquipotentialMap from '../../components/EquipotentialMap.jsx'
import FieldLineCanvas from '../../components/FieldLineCanvas.jsx'
import { generatePDFFromElement } from '../../utils/reportGenerator.js'

export default function DiscussionPage() {
  const navigate  = useNavigate()
  const { user }  = useAuth()

  const [pointSession, setPointSession] = useState(null)
  const [lineSession,  setLineSession]  = useState(null)
  const [questions, setQuestions]       = useState([])
  const [answers,   setAnswers]         = useState({})
  const [saveStatus, setSaveStatus]     = useState('idle')
  const [loading,   setLoading]         = useState(true)
  const [generating, setGenerating]     = useState(false)
  const [chartWidth, setChartWidth]     = useState(600)

  // 학번 / 이름 (로컬 입력, PDF 헤더용)
  const [studentId,   setStudentId]   = useState('')
  const [studentName, setStudentName] = useState('')

  const debounceRef    = useRef(null)
  const reportRef      = useRef(null)
  const surface3dRef   = useRef(null)

  useEffect(() => {
    function updateSize() { setChartWidth(Math.min(window.innerWidth - 32, 800)) }
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  useEffect(() => {
    if (!user) return
    Promise.all([
      getStudentSessions(user.uid),
      getDiscussionQuestions(),
      getDiscussionRecord(user.uid).catch(() => ({ answers: {}, completed: false })),
    ]).then(([sessions, qs, record]) => {
      const completed = sessions.filter(s => s.step >= 3)
      setPointSession(completed.find(s => s.experimentType === 'point_electrode') || null)
      setLineSession(completed.find(s => s.experimentType === 'line_electrode')   || null)
      setQuestions(qs)
      setAnswers(record?.answers || {})
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [user])

  function handleChange(qid, text) {
    const updated = { ...answers, [qid]: text }
    setAnswers(updated)
    setSaveStatus('saving')
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        await saveDiscussionDraft(user.uid, updated)
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 3000)
      } catch { setSaveStatus('idle') }
    }, 1500)
  }

  async function handleFinish() {
    try { await saveDiscussionFinal(user.uid, answers) } catch {}
    navigate('/student')
  }

  async function handleDownloadReport() {
    if (!reportRef.current) return
    setGenerating(true)
    try {
      // Plotly 3D 차트를 정적 이미지로 교체 (WebGL은 html2canvas가 캡처 못함)
      const plotEl = surface3dRef.current?.querySelector('.js-plotly-plot')
      let tempImg = null
      if (plotEl && window.Plotly) {
        try {
          const imgUrl = await window.Plotly.toImage(plotEl, {
            format: 'png',
            width: Math.min(chartWidth, 760),
            height: 380,
          })
          tempImg = document.createElement('img')
          tempImg.src = imgUrl
          tempImg.style.cssText = 'width:100%;border-radius:8px;display:block'
          plotEl.style.visibility = 'hidden'
          surface3dRef.current.appendChild(tempImg)
        } catch {}
      }

      const name = (studentName || '학생').trim()
      const id   = (studentId   || '').trim()
      await generatePDFFromElement(
        reportRef.current,
        `${id ? id + '_' : ''}${name}_등전위면_보고서.pdf`
      )

      // 복원
      if (tempImg) surface3dRef.current.removeChild(tempImg)
      if (plotEl)  plotEl.style.visibility = ''
    } catch (err) {
      console.error('보고서 생성 실패:', err)
      alert('보고서 생성 중 오류가 발생했습니다.')
    } finally {
      setGenerating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const answeredCount = questions.filter(q => answers[q.id]?.trim()).length
  const pointM = pointSession?.measurements || []
  const lineM  = lineSession?.measurements  || []

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">

      {/* ── 네비게이션 헤더 (보고서 밖) ── */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shadow-sm sticky top-0 z-10">
        <button onClick={() => navigate('/student')} className="text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-gray-900">토론 단계</h1>
          <p className="text-xs text-gray-500">두 실험 결과 비교 및 토론</p>
        </div>
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

      <main className="flex-1 p-4">
        <div className="max-w-4xl mx-auto space-y-4">

          {/* ══════════════════════════════════════
              보고서 영역 (이 div 전체가 PDF로 캡처됨)
          ══════════════════════════════════════ */}
          <div ref={reportRef} className="bg-white rounded-2xl shadow-sm overflow-hidden">

            {/* 보고서 헤더 */}
            <div className="bg-indigo-700 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">등전위면 측정 실험 보고서</h2>
                <p className="text-indigo-200 text-xs mt-0.5">PhysLab</p>
              </div>
              <div className="text-right text-indigo-200 text-xs">
                {new Date().toLocaleDateString('ko-KR')}
              </div>
            </div>

            {/* 학번 / 이름 입력 */}
            <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap gap-4 items-center">
              <div className="flex items-center gap-2">
                <label className="text-sm font-semibold text-gray-600 w-10 shrink-0">학번</label>
                <input
                  type="text"
                  value={studentId}
                  onChange={e => setStudentId(e.target.value)}
                  placeholder="학번 입력"
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 w-36"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-semibold text-gray-600 w-10 shrink-0">이름</label>
                <input
                  type="text"
                  value={studentName}
                  onChange={e => setStudentName(e.target.value)}
                  placeholder="이름 입력"
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 w-32"
                />
              </div>
            </div>

            {/* 3D 전위 지형도 */}
            <div className="px-6 py-5 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-700 mb-3">3D 전위 지형도</h3>
              <div ref={surface3dRef} className="overflow-x-auto">
                <Surface3D
                  measurements1={pointM.length > 0 ? pointM : null}
                  measurements2={lineM.length  > 0 ? lineM  : null}
                  title1="실험 1 — 점전극"
                  title2="실험 2 — 선전극"
                  width={Math.min(chartWidth, 760)}
                  height={380}
                />
              </div>
            </div>

            {/* 등전위선 + 전기력선 비교 */}
            <div className="px-6 py-5 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-700 mb-4">등전위선 & 전기력선 비교</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* 실험 1 — 점전극 */}
                <div className="flex flex-col items-center gap-3">
                  <p className="text-xs font-semibold text-red-700 bg-red-50 px-3 py-1 rounded-full">
                    실험 1 — 점전극
                  </p>
                  {pointSession ? (
                    <div className="flex flex-col items-center gap-2 w-full">
                      <EquipotentialMap
                        measurements={pointM}
                        electrodeConfig={pointSession.electrodeConfig}
                        width={240} height={240} levels={20}
                      />
                      <FieldLineCanvas
                        measurements={pointM}
                        drawnLines={deserializeLines(pointSession.drawnLines || [])}
                        electrodeConfig={pointSession.electrodeConfig}
                        width={240} height={240}
                        readOnly
                      />
                    </div>
                  ) : (
                    <div className="w-60 h-60 bg-gray-100 rounded-xl flex items-center justify-center">
                      <p className="text-xs text-gray-400">데이터 없음</p>
                    </div>
                  )}
                </div>

                {/* 실험 2 — 선전극 */}
                <div className="flex flex-col items-center gap-3">
                  <p className="text-xs font-semibold text-amber-700 bg-amber-50 px-3 py-1 rounded-full">
                    실험 2 — 선전극
                  </p>
                  {lineSession ? (
                    <div className="flex flex-col items-center gap-2 w-full">
                      <EquipotentialMap
                        measurements={lineM}
                        electrodeConfig={lineSession.electrodeConfig}
                        width={240} height={240} levels={20}
                      />
                      <FieldLineCanvas
                        measurements={lineM}
                        drawnLines={deserializeLines(lineSession.drawnLines || [])}
                        electrodeConfig={lineSession.electrodeConfig}
                        width={240} height={240}
                        readOnly
                      />
                    </div>
                  ) : (
                    <div className="w-60 h-60 bg-gray-100 rounded-xl flex items-center justify-center">
                      <p className="text-xs text-gray-400">데이터 없음</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 토론 Q&A */}
            <div className="px-6 py-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-gray-700">토론 답변</h3>
                <span className="text-xs text-indigo-600 font-medium bg-indigo-50 px-2 py-0.5 rounded-full">
                  {answeredCount} / {questions.length} 작성 완료
                </span>
              </div>

              {questions.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-8">
                  선생님이 아직 토론 질문을 등록하지 않았습니다.
                </p>
              ) : (
                <div className="space-y-5">
                  {questions.map((q, idx) => {
                    const answered = answers[q.id]?.trim()
                    return (
                      <div key={q.id}>
                        <div className="flex items-start gap-2 mb-2">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                            answered ? 'bg-indigo-500 text-white' : 'bg-gray-200 text-gray-500'
                          }`}>
                            {answered ? '✓' : idx + 1}
                          </span>
                          <p className="text-sm text-gray-800 font-medium leading-relaxed">{q.text}</p>
                        </div>
                        <textarea
                          value={answers[q.id] || ''}
                          onChange={e => handleChange(q.id, e.target.value)}
                          placeholder="답을 입력하세요..."
                          rows={3}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent resize-none ml-8"
                          style={{ width: 'calc(100% - 2rem)' }}
                        />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

          </div>
          {/* ── 보고서 영역 끝 ── */}

          {/* 액션 버튼 (보고서 밖, PDF에 미포함) */}
          <button
            onClick={handleDownloadReport}
            disabled={generating}
            className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base transition-all shadow-md hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {generating ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                보고서 생성 중...
              </span>
            ) : '📄 실험 보고서 PDF 다운로드'}
          </button>

          <button
            onClick={handleFinish}
            className="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-lg transition-all shadow-lg hover:shadow-xl"
          >
            토론 완료 — 홈으로 돌아가기
          </button>

        </div>
      </main>
    </div>
  )
}
