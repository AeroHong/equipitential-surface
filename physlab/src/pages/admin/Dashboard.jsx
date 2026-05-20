import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from '../../firebase.js'
import { useAuth } from '../../App.jsx'
import {
  subscribeAllStudents, subscribeAllSessions, subscribeStudentSessions,
  deleteStudent, getDiscussionQuestions, saveDiscussionQuestions
} from '../../services/firebase.js'
import EquipotentialMap from '../../components/EquipotentialMap.jsx'
import Grid8x8 from '../../components/Grid8x8.jsx'

const EXP_LABELS = { point_electrode: '점전극', line_electrode: '선전극' }

function timeDiffSec(ts) {
  if (!ts) return Infinity
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return (Date.now() - d.getTime()) / 1000
}

function formatTime(ts) {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  const diff = Math.floor((Date.now() - d) / 1000)
  if (diff < 60)    return `${diff}초 전`
  if (diff < 3600)  return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
  return d.toLocaleDateString('ko-KR')
}

// ── 미니 격자 (카드 내부) ────────────────────────────────────────
function MiniGrid({ measurements = [], electrodeConfig }) {
  const CELL = 22
  const map  = new Map()
  for (const m of measurements) map.set(`${m.x},${m.y}`, m.V)
  const comCoord = electrodeConfig?.negative
    ? { x: Math.min(7, Math.max(0, Math.round(electrodeConfig.negative.x))),
        y: Math.min(7, Math.max(0, Math.round(electrodeConfig.negative.y))) }
    : null

  return (
    <div className="flex flex-col gap-px">
      {Array.from({ length: 8 }, (_, row) => (
        <div key={row} className="flex gap-px">
          {Array.from({ length: 8 }, (_, col) => {
            const V     = map.get(`${col},${row}`)
            const isCom = comCoord && col === comCoord.x && row === comCoord.y
            const filled = V !== undefined || isCom
            return (
              <div key={col}
                style={{ width: CELL, height: CELL }}
                className={`rounded-sm flex items-center justify-center ${
                  isCom  ? 'bg-indigo-500' :
                  filled ? 'bg-blue-400'   : 'bg-gray-100 border border-gray-200'
                }`}
                title={`(${col},${row})${filled ? ` = ${isCom ? '0.0' : Number(V).toFixed(1)}V` : ''}`}
              >
                {filled && (
                  <span className="text-white font-bold leading-none" style={{ fontSize: 6 }}>
                    {isCom ? '0' : Number(V).toFixed(1)}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// ── 학생 카드 ────────────────────────────────────────────────────
function StudentCard({ student, sessions, onClick, onDelete }) {
  const latest   = sessions[0]
  const isActive = latest && timeDiffSec(latest.updatedAt) < 120
  const isIdle   = latest && timeDiffSec(latest.updatedAt) >= 120 && timeDiffSec(latest.updatedAt) < 600
  const step     = latest?.step || 0
  const measurements = latest?.measurements || []
  const filled   = measurements.length

  const stepColor = step >= 4 ? 'bg-green-100 text-green-700 border-green-200'
                  : step === 3 ? 'bg-teal-100 text-teal-700 border-teal-200'
                  : step === 2 ? 'bg-purple-100 text-purple-700 border-purple-200'
                  : step === 1 ? 'bg-blue-100 text-blue-700 border-blue-200'
                  : 'bg-gray-100 text-gray-400 border-gray-200'
  const stepLabel = step >= 4 ? '✅ 완료'
                  : step === 3 ? 'Step 3'
                  : step === 2 ? 'Step 2'
                  : step === 1 ? 'Step 1'
                  : '미시작'

  return (
    <div className="relative">
    <button
      onClick={onClick}
      className={[
        'bg-white rounded-2xl border-2 p-4 text-left transition-all hover:shadow-md active:scale-98 w-full',
        isActive ? 'border-blue-400 shadow-blue-100 shadow-md'
        : isIdle  ? 'border-gray-200'
        : 'border-gray-200'
      ].join(' ')}
    >
      {/* 상단: 이름 + 상태 */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            {(student.name || student.email || '?')[0].toUpperCase()}
          </div>
          <div>
            <p className="font-bold text-gray-800 text-sm leading-tight">
              {student.name || '(이름 없음)'}
            </p>
            <p className="text-xs text-gray-400">
              {student.class ? `${student.class}반` : student.email?.split('@')[0]}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {isActive && (
            <span className="flex items-center gap-1 text-xs bg-blue-500 text-white rounded-full px-2 py-0.5 font-semibold">
              <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
              실험 중
            </span>
          )}
          {isIdle && (
            <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
              대기 중
            </span>
          )}
          <span className={`text-xs rounded-full px-2 py-0.5 border font-medium ${stepColor}`}>
            {stepLabel}
          </span>
        </div>
      </div>

      {/* Step 1 진행 중: 미니 격자 */}
      {step === 1 && latest && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-gray-500">입력 현황</span>
            <span className="text-xs font-bold text-blue-600">{filled}/64</span>
          </div>
          <MiniGrid measurements={measurements} electrodeConfig={latest.electrodeConfig} />
          <div className="mt-1.5 w-full bg-gray-100 rounded-full h-1.5">
            <div className="bg-blue-500 h-1.5 rounded-full transition-all"
              style={{ width: `${(filled / 64) * 100}%` }} />
          </div>
        </div>
      )}

      {/* Step 2 이상: 등전위선 썸네일 */}
      {step >= 2 && measurements.length >= 3 && (
        <div className="mb-3 flex justify-center">
          <EquipotentialMap
            measurements={measurements}
            electrodeConfig={latest.electrodeConfig}
            width={176}
            height={120}
            levels={8}
          />
        </div>
      )}

      {/* 하단: 실험 타입 + 시간 */}
      <div className="flex items-center justify-between mt-1">
        <span className="text-xs text-gray-400">
          {latest ? EXP_LABELS[latest.experimentType] || '—' : '—'}
          {sessions.length > 1 && ` · ${sessions.length}세션`}
        </span>
        <span className="text-xs text-gray-400">{latest ? formatTime(latest.updatedAt) : '—'}</span>
      </div>
    </button>

    {/* 삭제 버튼 (카드 우하단, 항상 표시) */}
    <button
      onClick={(e) => { e.stopPropagation(); onDelete && onDelete() }}
      className="absolute bottom-3 right-3 z-10 text-xs text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg px-2 py-1 transition-all font-medium border border-transparent hover:border-red-200"
      title={`${student.name} 학생 삭제`}
    >
      삭제
    </button>
    </div>
  )
}

// ── 상세 슬라이드 패널 ───────────────────────────────────────────
function DetailPanel({ student, onClose, onFullPage, questions = [] }) {
  const [sessions, setSessions] = useState([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    if (!student) return
    const unsub = subscribeStudentSessions(student.uid, (data) => {
      setSessions(data)
      setLoading(false)
    })
    return unsub
  }, [student?.uid])

  if (!student) return null

  const latest     = sessions[0]
  const isActive   = latest && timeDiffSec(latest.updatedAt) < 120
  const measurements = latest?.measurements || []

  return (
    <>
      {/* 배경 오버레이 */}
      <div
        className="fixed inset-0 bg-black bg-opacity-30 z-40 transition-opacity"
        onClick={onClose}
      />
      {/* 패널 */}
      <div className="fixed right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl z-50 flex flex-col overflow-hidden">
        {/* 패널 헤더 */}
        <div className={`px-5 py-4 border-b flex items-center justify-between flex-shrink-0 ${isActive ? 'bg-blue-50 border-blue-100' : 'bg-white border-gray-200'}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold">
              {(student.name || '?')[0].toUpperCase()}
            </div>
            <div>
              <p className="font-bold text-gray-900 flex items-center gap-2">
                {student.name || '(이름 없음)'}
                {isActive && (
                  <span className="flex items-center gap-1 text-xs bg-blue-500 text-white rounded-full px-2 py-0.5">
                    <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                    실험 중
                  </span>
                )}
              </p>
              <p className="text-xs text-gray-500">{student.email}  {student.class && `· ${student.class}반`}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onFullPage}
              className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition-colors"
            >
              전체 보기 →
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* 패널 내용 */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center text-gray-400 py-12">아직 진행한 실험이 없습니다.</div>
          ) : sessions.map(session => {
            const ms      = session.measurements || []
            const sActive = timeDiffSec(session.updatedAt) < 120

            return (
              <div key={session.id}
                className={`rounded-xl border p-4 ${sActive ? 'border-blue-300 bg-blue-50/40' : 'border-gray-200 bg-white'}`}>
                {/* 세션 헤더 */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${session.step === 3 ? 'bg-green-500' : session.step === 2 ? 'bg-purple-500' : 'bg-blue-500'}`} />
                    <span className="font-semibold text-sm text-gray-800">
                      {EXP_LABELS[session.experimentType] || session.experimentType}
                    </span>
                    <span className={`text-xs rounded-full px-2 py-0.5 ${session.step === 3 ? 'bg-green-100 text-green-700' : session.step === 2 ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                      Step {session.step}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">{formatTime(session.updatedAt)}</span>
                </div>

                {/* Step 1: 격자 */}
                {session.step === 1 && (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-500 font-medium">실시간 입력 현황</span>
                      <span className="text-xs font-bold text-blue-600">{ms.length}/64</span>
                    </div>
                    <div className="overflow-x-auto">
                      <Grid8x8
                        measurements={ms}
                        electrodeConfig={session.electrodeConfig}
                      />
                    </div>
                  </>
                )}

                {/* Step 2 이상: 등전위선 */}
                {session.step >= 2 && ms.length >= 3 && (
                  <div className="flex justify-center">
                    <EquipotentialMap
                      measurements={ms}
                      electrodeConfig={session.electrodeConfig}
                      width={320}
                      height={220}
                      levels={10}
                    />
                  </div>
                )}

                {/* 토론 답변 */}
                {session.answers && Object.keys(session.answers).length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-xs font-semibold text-indigo-700 mb-2">💬 토론 답변</p>
                    {questions.map((q, idx) => {
                      const ans = session.answers[q.id]
                      if (!ans?.trim()) return null
                      return (
                        <div key={q.id} className="mb-2">
                          <p className="text-xs text-gray-500 font-medium">Q{idx + 1}. {q.text.slice(0, 50)}...</p>
                          <p className="text-xs text-gray-700 mt-0.5 bg-indigo-50 rounded-lg p-2">{ans}</p>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

// ── 질문 관리 모달 ────────────────────────────────────────────────
function QuestionManagerModal({ onClose }) {
  const [questions, setQuestions] = useState([])
  const [newText, setNewText] = useState('')
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    getDiscussionQuestions().then(qs => { setQuestions(qs); setLoaded(true) })
  }, [])

  function addQuestion() {
    const text = newText.trim()
    if (!text) return
    const id = `q${Date.now()}`
    setQuestions(prev => [...prev, { id, text, order: prev.length + 1 }])
    setNewText('')
  }

  function removeQuestion(id) {
    setQuestions(prev => prev.filter(q => q.id !== id))
  }

  function updateQuestion(id, text) {
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, text } : q))
  }

  async function handleSave() {
    setSaving(true)
    try {
      await saveDiscussionQuestions(questions)
      onClose()
    } catch (err) {
      alert('저장 실패: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-40 z-40" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900">토론 질문 관리</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {!loaded && (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {loaded && questions.map((q, idx) => (
              <div key={q.id} className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-2">
                  {idx + 1}
                </div>
                <textarea
                  value={q.text}
                  onChange={e => updateQuestion(q.id, e.target.value)}
                  rows={2}
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                />
                <button
                  onClick={() => removeQuestion(q.id)}
                  className="text-gray-300 hover:text-red-500 mt-2 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}

            {/* 새 질문 추가 */}
            <div className="flex items-start gap-2 pt-2 border-t border-gray-100">
              <textarea
                value={newText}
                onChange={e => setNewText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) addQuestion() }}
                placeholder="새 질문 입력... (Ctrl+Enter로 추가)"
                rows={2}
                className="flex-1 border border-dashed border-indigo-300 rounded-xl px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
              />
              <button
                onClick={addQuestion}
                disabled={!newText.trim()}
                className="mt-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl disabled:opacity-40 transition-colors"
              >
                추가
              </button>
            </div>
          </div>

          <div className="px-5 py-4 border-t border-gray-200 flex gap-2">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50">
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:opacity-40 transition-colors"
            >
              {saving ? '저장 중...' : '저장 (학생에게 즉시 반영)'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ── 메인 대시보드 ────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate()
  const { user, userInfo } = useAuth()
  const [students,     setStudents]     = useState([])
  const [sessions,     setSessions]     = useState([])
  const [questions,    setQuestions]    = useState([])
  const [searchQuery,  setSearchQuery]  = useState('')
  const [filterStep,   setFilterStep]   = useState('all')
  const [loading,      setLoading]      = useState(true)
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [showQManager, setShowQManager] = useState(false)

  useEffect(() => {
    const unsubStudents = subscribeAllStudents(data => { setStudents(data); setLoading(false) })
    const unsubSessions = subscribeAllSessions(data => setSessions(data))
    getDiscussionQuestions().then(setQuestions)
    return () => { unsubStudents(); unsubSessions() }
  }, [])

  const sessionsByStudent = {}
  for (const s of sessions) {
    if (!sessionsByStudent[s.studentUid]) sessionsByStudent[s.studentUid] = []
    sessionsByStudent[s.studentUid].push(s)
  }

  const filtered = students.filter(st => {
    const match = !searchQuery ||
      (st.name  || '').includes(searchQuery) ||
      (st.email || '').includes(searchQuery) ||
      (st.class || '').includes(searchQuery)
    if (!match) return false
    if (filterStep === 'all') return true
    const ss = sessionsByStudent[st.uid] || []
    if (filterStep === 'none') return ss.length === 0
    if (filterStep === 'active') {
      const latest = ss[0]
      return latest && timeDiffSec(latest.updatedAt) < 120
    }
    const maxStep = ss.reduce((m, s) => Math.max(m, s.step || 0), 0)
    return maxStep === parseInt(filterStep)
  })

  const totalStudents    = students.length
  const completedStudents = students.filter(st => (sessionsByStudent[st.uid] || []).some(s => s.step >= 4)).length
  const activeStudents   = students.filter(st => {
    const latest = (sessionsByStudent[st.uid] || [])[0]
    return latest && timeDiffSec(latest.updatedAt) < 120
  }).length

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between shadow-sm sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-xs font-bold">PL</span>
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900">PhysLab 관리 콘솔</h1>
            <p className="text-xs text-gray-500">Super Admin</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-green-600">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            실시간
          </div>
          <button
            onClick={() => setShowQManager(true)}
            className="text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-50 font-medium transition-colors"
          >
            💬 질문 관리
          </button>
          <span className="text-sm text-gray-600 hidden sm:block">{userInfo?.name || user?.displayName}</span>
          <button onClick={async () => { await signOut(auth); navigate('/login') }}
            className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50">
            로그아웃
          </button>
        </div>
      </header>

      <main className="flex-1 p-5 max-w-7xl mx-auto w-full">
        {/* 통계 */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: '전체 학생',    value: totalStudents,    color: 'text-gray-800',   border: 'border-gray-200' },
            { label: '실험 완료',    value: completedStudents, color: 'text-green-600', border: 'border-green-100' },
            { label: '현재 실험 중', value: activeStudents,   color: 'text-blue-600',   border: 'border-blue-100' },
          ].map(({ label, value, color, border }) => (
            <div key={label} className={`bg-white rounded-xl p-4 shadow-sm border ${border} text-center`}>
              <p className="text-xs text-gray-500">{label}</p>
              <p className={`text-3xl font-black mt-1 ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* 검색 & 필터 */}
        <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-200 mb-5 flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            placeholder="이름, 이메일, 반 검색..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <div className="flex gap-1.5 flex-wrap">
            {[
              { value: 'all',    label: '전체' },
              { value: 'active', label: '🔴 실험 중' },
              { value: 'none',   label: '미시작' },
              { value: '1',      label: 'Step 1' },
              { value: '2',      label: 'Step 2' },
              { value: '3',      label: 'Step 3' },
              { value: '4',      label: '✅ 완료' },
            ].map(opt => (
              <button key={opt.value} onClick={() => setFilterStep(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filterStep === opt.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 카드 그리드 */}
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-700">학생 목록 ({filtered.length}명)</h2>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">해당하는 학생이 없습니다.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map(student => (
              <StudentCard
                key={student.uid}
                student={student}
                sessions={sessionsByStudent[student.uid] || []}
                onClick={() => setSelectedStudent(student)}
                onDelete={async () => {
                  if (!window.confirm(`${student.name} 학생을 삭제할까요?`)) return
                  try {
                    await deleteStudent(student.uid)
                  } catch (err) {
                    console.error('학생 삭제 실패:', err)
                    alert('삭제 중 오류가 발생했습니다.')
                  }
                }}
              />
            ))}
          </div>
        )}
      </main>

      {/* 슬라이드 패널 */}
      {selectedStudent && (
        <DetailPanel
          student={selectedStudent}
          questions={questions}
          onClose={() => setSelectedStudent(null)}
          onFullPage={() => { navigate(`/admin/student/${selectedStudent.uid}`); setSelectedStudent(null) }}
        />
      )}

      {/* 질문 관리 모달 */}
      {showQManager && (
        <QuestionManagerModal
          onClose={() => {
            setShowQManager(false)
            // 저장 후 질문 목록 새로고침
            getDiscussionQuestions().then(setQuestions)
          }}
        />
      )}
    </div>
  )
}
