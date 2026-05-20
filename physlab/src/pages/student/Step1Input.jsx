import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Grid8x8 from '../../components/Grid8x8.jsx'
import EquipotentialMap from '../../components/EquipotentialMap.jsx'
import { getSession, updateMeasurements, updateStep } from '../../services/firebase.js'

/**
 * 숫자 키패드 모달 컴포넌트
 */
function VoltageModal({ cell, initialValue, onConfirm, onCancel, onDelete }) {
  const [value, setValue] = useState(initialValue !== undefined ? String(initialValue) : '')

  function press(ch) {
    if (ch === '.' && value.includes('.')) return
    if (ch === '⌫') {
      setValue(v => v.slice(0, -1))
      return
    }
    if (ch === '±') {
      setValue(v => v.startsWith('-') ? v.slice(1) : '-' + v)
      return
    }
    setValue(v => v + ch)
  }

  function confirm() {
    const num = parseFloat(value)
    if (isNaN(num)) { alert('올바른 숫자를 입력하세요.'); return }
    onConfirm(num)
  }

  const KEYS = [
    ['7', '8', '9'],
    ['4', '5', '6'],
    ['1', '2', '3'],
    ['±', '0', '.'],
  ]

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-72 overflow-hidden">
        {/* 헤더 */}
        <div className="bg-blue-600 px-5 py-4">
          <p className="text-blue-200 text-sm">격자 위치</p>
          <p className="text-white text-xl font-bold">
            ({cell.x}, {cell.y}) 전위값
          </p>
        </div>

        {/* 입력 디스플레이 */}
        <div className="px-5 py-3 border-b border-gray-100">
          <div className="bg-gray-50 rounded-xl px-4 py-3 text-right">
            <span className="text-3xl font-mono font-bold text-gray-800">
              {value || '0'}
            </span>
            <span className="text-lg text-gray-400 ml-1">V</span>
          </div>
        </div>

        {/* 키패드 */}
        <div className="p-4">
          {/* 삭제 버튼 - 이미 값이 있을 때만 표시 */}
          {initialValue !== undefined && onDelete && (
            <button
              onClick={onDelete}
              className="w-full mb-3 py-2 rounded-xl text-red-600 hover:bg-red-50 text-sm font-semibold transition-all active:scale-95 border border-red-200"
            >
              이 값 삭제
            </button>
          )}

          <div className="grid grid-cols-3 gap-2 mb-2">
            {KEYS.map((row, ri) =>
              row.map((key) => (
                <button
                  key={`${ri}-${key}`}
                  onClick={() => press(key)}
                  className={[
                    'h-14 rounded-xl text-xl font-semibold transition-all active:scale-90',
                    key === '±'
                      ? 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                      : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                  ].join(' ')}
                >
                  {key}
                </button>
              ))
            )}
          </div>

          {/* 백스페이스 */}
          <button
            onClick={() => press('⌫')}
            className="w-full h-12 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 text-xl font-semibold transition-all active:scale-95 mb-2"
          >
            ⌫
          </button>

          {/* 확인 / 취소 */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onCancel}
              className="h-12 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold transition-all active:scale-95"
            >
              취소
            </button>
            <button
              onClick={confirm}
              className="h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-all active:scale-95"
            >
              확인
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// 저장 상태 타입: 'saved' | 'saving' | 'idle'
export default function Step1Input() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const [session, setSession] = useState(null)
  const [measurements, setMeasurements] = useState([])
  const [selectedCell, setSelectedCell] = useState(null)
  const [modalCell, setModalCell] = useState(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [autoSaveStatus, setAutoSaveStatus] = useState('idle') // 'idle' | 'saving' | 'saved'

  // debounce 타이머 ref
  const debounceTimer = useRef(null)
  // 최신 measurements를 참조하기 위한 ref (beforeunload 핸들러용)
  const measurementsRef = useRef([])

  useEffect(() => {
    getSession(sessionId).then((s) => {
      if (!s) { navigate('/student'); return }
      setSession(s)
      let loaded = s.measurements || []

      // COM 참조점(음극 위치)을 0V로 자동 등록
      if (s.electrodeConfig?.negative) {
        const neg = s.electrodeConfig.negative
        const cx = Math.min(7, Math.max(0, Math.round(neg.x)))
        const cy = Math.min(7, Math.max(0, Math.round(neg.y)))
        const alreadySet = loaded.some(m => m.x === cx && m.y === cy)
        if (!alreadySet) {
          loaded = [{ x: cx, y: cy, V: 0 }, ...loaded]
        }
      }

      setMeasurements(loaded)
      measurementsRef.current = loaded
      setLoading(false)
    })
  }, [sessionId])

  // measurements 변경 시 debounce 자동저장 (1.5초)
  useEffect(() => {
    if (loading) return
    if (measurements.length === 0) return

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
    }

    setAutoSaveStatus('saving')

    debounceTimer.current = setTimeout(async () => {
      try {
        await updateMeasurements(sessionId, measurements)
        setAutoSaveStatus('saved')
        // 3초 후 idle로
        setTimeout(() => setAutoSaveStatus('idle'), 3000)
      } catch (err) {
        console.error('자동저장 실패:', err)
        setAutoSaveStatus('idle')
      }
    }, 1500)

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [measurements, loading, sessionId])

  // measurements ref 동기화
  useEffect(() => {
    measurementsRef.current = measurements
  }, [measurements])

  // 페이지 이탈 시 마지막 상태 저장
  useEffect(() => {
    function handleBeforeUnload() {
      if (measurementsRef.current.length > 0) {
        // 비동기 저장 시도 (best-effort)
        updateMeasurements(sessionId, measurementsRef.current).catch(() => {})
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [sessionId])

  const handleCellClick = useCallback((x, y) => {
    const existing = measurements.find(m => m.x === x && m.y === y)
    setModalCell({ x, y, existing: existing?.V })
    setSelectedCell(`${x},${y}`)
  }, [measurements])

  function handleConfirm(V) {
    const next = measurements.filter(m => !(m.x === modalCell.x && m.y === modalCell.y))
    next.push({ x: modalCell.x, y: modalCell.y, V })
    setMeasurements(next)
    setModalCell(null)
    setSelectedCell(null)
  }

  function handleDelete(x, y) {
    // COM 셀은 삭제 불가
    const neg = session?.electrodeConfig?.negative
    if (neg) {
      const cx = Math.min(7, Math.max(0, Math.round(neg.x)))
      const cy = Math.min(7, Math.max(0, Math.round(neg.y)))
      if (x === cx && y === cy) return
    }
    setMeasurements(prev => prev.filter(m => !(m.x === x && m.y === y)))
    setModalCell(null)
    setSelectedCell(null)
  }

  async function handleNext() {
    if (measurements.length < 64) return
    setSaving(true)
    try {
      await updateMeasurements(sessionId, measurements)
      await updateStep(sessionId, 2)
      navigate(`/student/session/${sessionId}/step2`)
    } catch (err) {
      console.error(err)
      alert('저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const isComplete = measurements.length >= 64
  const EXP_LABEL = session?.experimentType === 'line_electrode' ? '실험 2 — 선전극' : '실험 1 — 점전극'

  function generateTestData(experimentType, electrodeConfig) {
    const data = []
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        let V
        if (experimentType === 'point_electrode') {
          const dPos = Math.sqrt((x + 0.5) ** 2 + (y + 0.5) ** 2) + 0.5
          const dNeg = Math.sqrt((x - 7.5) ** 2 + (y - 7.5) ** 2) + 0.5
          V = 4.5 / dPos - 4.5 / dNeg + 4.5
        } else {
          V = 9 * (7 - y) / 7
        }
        V = Math.max(0, Math.min(9, V + (Math.random() - 0.5) * 0.1))
        data.push({ x, y, V: Math.round(V * 100) / 100 })
      }
    }
    // COM 셀 0V로 덮어쓰기
    if (electrodeConfig?.negative) {
      const cx = Math.min(7, Math.max(0, Math.round(electrodeConfig.negative.x)))
      const cy = Math.min(7, Math.max(0, Math.round(electrodeConfig.negative.y)))
      const idx = data.findIndex(m => m.x === cx && m.y === cy)
      if (idx >= 0) data[idx].V = 0
    }
    return data
  }

  function handleFillTestData() {
    const data = generateTestData(session?.experimentType, session?.electrodeConfig)
    setMeasurements(data)
  }

  function handleResetAll() {
    if (!window.confirm('모든 측정값을 초기화할까요?')) return
    const neg = session?.electrodeConfig?.negative
    if (neg) {
      const cx = Math.min(7, Math.max(0, Math.round(neg.x)))
      const cy = Math.min(7, Math.max(0, Math.round(neg.y)))
      setMeasurements(prev => prev.filter(m => m.V === 0 && m.x === cx && m.y === cy))
    } else {
      setMeasurements([])
    }
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
            <span className="text-xs bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 font-medium">Step 1</span>
            <span className="text-xs text-gray-500">데이터 입력</span>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {/* 자동저장 상태 */}
          <AutoSaveBadge />
          {/* 전체 초기화 */}
          <button
            onClick={handleResetAll}
            className="text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-300 rounded-lg px-2 py-1 hover:bg-red-50 transition-colors"
          >
            전체 초기화
          </button>
          <div className="text-right">
            <span className={`text-sm font-bold ${isComplete ? 'text-green-600' : 'text-blue-600'}`}>
              {measurements.length} / 64
            </span>
            {isComplete && <p className="text-xs text-green-600">완료!</p>}
          </div>
        </div>
      </header>

      {/* 진행 단계 표시 */}
      <div className="bg-white border-b border-gray-100 px-4 py-2 flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <React.Fragment key={s}>
            <div className={`flex items-center gap-1.5 text-xs font-medium ${s === 1 ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${s === 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>{s}</div>
              {s === 1 ? '데이터 입력' : s === 2 ? '전기력선' : '3D 결과'}
            </div>
            {s < 3 && <div className="flex-1 h-0.5 bg-gray-200 max-w-12" />}
          </React.Fragment>
        ))}
      </div>

      {/* 테스트 데이터 채우기 (개발용) */}
      <div className="bg-white border-b border-gray-100 px-4 py-1.5 flex justify-end">
        <button
          onClick={handleFillTestData}
          className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors"
        >
          🧪 테스트 데이터 채우기
        </button>
      </div>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 p-4">
        <div className="flex flex-col lg:flex-row gap-6 max-w-4xl mx-auto">
          {/* 격자 영역 */}
          <div className="flex-shrink-0">
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">
                격자 측정값 입력
              </h2>
              <p className="text-xs text-gray-400 mb-3">
                셀을 터치하여 멀티미터 측정값을 입력하세요.
              </p>
              <Grid8x8
                measurements={measurements}
                onCellClick={handleCellClick}
                selectedCell={selectedCell}
                electrodeConfig={session?.electrodeConfig}
              />
            </div>
          </div>

          {/* 등전위선 미리보기 */}
          <div className="flex-1 min-w-0">
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
              <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                등전위선 실시간 미리보기
                {measurements.length >= 3 && (
                  <span className="text-xs bg-green-100 text-green-700 rounded-full px-2 py-0.5">
                    업데이트 중
                  </span>
                )}
              </h2>
              <EquipotentialMap
                measurements={measurements}
                electrodeConfig={session?.electrodeConfig}
                width={300}
                height={300}
                levels={12}
              />
              {measurements.length < 3 && (
                <p className="text-xs text-gray-400 mt-2 text-center">
                  3개 이상 입력하면 등전위선이 표시됩니다
                </p>
              )}
            </div>
          </div>
        </div>

        {/* 다음 단계 버튼 */}
        <div className="max-w-4xl mx-auto mt-6">
          <button
            onClick={handleNext}
            disabled={!isComplete || saving}
            className={[
              'w-full py-4 rounded-2xl font-bold text-lg transition-all duration-200',
              isComplete && !saving
                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl active:scale-98'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            ].join(' ')}
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                저장 중...
              </span>
            ) : isComplete ? (
              'Step 2 — 전기력선 그리기 →'
            ) : (
              `아직 ${64 - measurements.length}개 더 입력해야 합니다`
            )}
          </button>
        </div>
      </main>

      {/* 전위값 입력 모달 */}
      {modalCell && (
        <VoltageModal
          cell={modalCell}
          initialValue={modalCell.existing}
          onConfirm={handleConfirm}
          onCancel={() => { setModalCell(null); setSelectedCell(null) }}
          onDelete={() => handleDelete(modalCell.x, modalCell.y)}
        />
      )}
    </div>
  )
}
