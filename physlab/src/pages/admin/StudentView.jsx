import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import EquipotentialMap from '../../components/EquipotentialMap.jsx'
import Grid8x8 from '../../components/Grid8x8.jsx'
import FieldLineCanvas from '../../components/FieldLineCanvas.jsx'
import Surface3D from '../../components/Surface3D.jsx'
import { getUser, subscribeStudentSessions } from '../../services/firebase.js'

const EXP_LABELS = {
  point_electrode: '실험 1 — 점전극',
  line_electrode:  '실험 2 — 선전극'
}

function formatTime(ts) {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleString('ko-KR')
}

function timeDiffSec(ts) {
  if (!ts) return Infinity
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return (Date.now() - d.getTime()) / 1000
}

// ── 세션 카드 ───────────────────────────────────────────────────
function SessionCard({ session }) {
  const [expanded, setExpanded] = useState(false)
  const measurements  = session.measurements || []
  const isActive      = timeDiffSec(session.updatedAt) < 120   // 2분 이내 = 활성
  const isStep1       = session.step === 1
  const isStep2       = session.step === 2
  const isStep3       = session.step === 3

  const stepColor = isStep3 ? 'bg-green-100 text-green-700'
                  : isStep2 ? 'bg-purple-100 text-purple-700'
                  : 'bg-blue-100 text-blue-700'
  const stepLabel = isStep3 ? 'Step 3 완료'
                  : isStep2 ? 'Step 2 전기력선'
                  : 'Step 1 입력 중'

  return (
    <div className={`bg-white rounded-xl border overflow-hidden shadow-sm transition-all ${isActive ? 'border-blue-300 ring-2 ring-blue-100' : 'border-gray-200'}`}>
      {/* 활성 표시 배너 */}
      {isActive && (
        <div className="bg-blue-50 border-b border-blue-100 px-4 py-1.5 flex items-center gap-2">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
          <span className="text-xs text-blue-600 font-semibold">실시간 진행 중</span>
          <span className="text-xs text-blue-400 ml-auto">{formatTime(session.updatedAt)}</span>
        </div>
      )}

      {/* 헤더 */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full ${isStep3 ? 'bg-green-500' : isStep2 ? 'bg-purple-500' : 'bg-blue-500'}`} />
          <div>
            <span className="font-semibold text-gray-800 text-sm">
              {EXP_LABELS[session.experimentType] || session.experimentType}
            </span>
            <span className={`ml-2 text-xs rounded-full px-2 py-0.5 font-medium ${stepColor}`}>
              {stepLabel}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-400">
          <span>측정 {measurements.length}/64</span>
          {session.score != null && (
            <span className="font-semibold text-purple-600">{session.score}점</span>
          )}
          {!isActive && <span>{formatTime(session.updatedAt)}</span>}
          <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Step 1 활성: 헤더 아래 미니 격자 항상 표시 */}
      {isStep1 && isActive && !expanded && (
        <div className="border-t border-blue-100 px-5 py-3 bg-blue-50/50">
          <p className="text-xs text-blue-500 font-medium mb-2">
            실시간 입력 현황 — {measurements.length}/64
          </p>
          <div className="overflow-x-auto">
            <MiniGrid measurements={measurements} electrodeConfig={session.electrodeConfig} />
          </div>
        </div>
      )}

      {/* 펼친 상세 */}
      {expanded && (
        <div className="border-t border-gray-100 p-5 space-y-6">

          {/* Step 1: 그리드 + 등전위선 */}
          <div>
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
              Step 1 — 데이터 입력
              {isStep1 && isActive && (
                <span className="flex items-center gap-1 text-blue-500 normal-case font-normal">
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                  실시간
                </span>
              )}
            </h4>
            <div className="flex flex-col lg:flex-row gap-5 items-start">
              {/* 격자 */}
              <div className="overflow-x-auto">
                <Grid8x8
                  measurements={measurements}
                  electrodeConfig={session.electrodeConfig}
                />
              </div>
              {/* 등전위선 */}
              {measurements.length >= 3 && (
                <div>
                  <p className="text-xs text-gray-400 mb-2">등전위선 미리보기</p>
                  <EquipotentialMap
                    measurements={measurements}
                    electrodeConfig={session.electrodeConfig}
                    width={240}
                    height={240}
                    levels={12}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Step 2: 전기력선 */}
          {session.step >= 2 && (
            <div>
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
                Step 2 — 전기력선
                {session.score != null && (
                  <span className="ml-2 text-purple-600 normal-case font-semibold">
                    수직도 {session.score}점
                  </span>
                )}
              </h4>
              <FieldLineCanvas
                measurements={measurements}
                drawnLines={session.drawnLines || []}
                aiLines={[]}
                width={280}
                height={280}
                electrodeConfig={session.electrodeConfig}
                readOnly
              />
            </div>
          )}

          {/* Step 3: 3D */}
          {session.step >= 3 && measurements.length >= 3 && (
            <div>
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
                Step 3 — 3D 전위 지형도
              </h4>
              <Surface3D
                measurements1={measurements}
                title1={EXP_LABELS[session.experimentType]}
                width={380}
                height={300}
              />
            </div>
          )}

          {/* 측정 테이블 */}
          {measurements.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                측정 원본 데이터 ({measurements.length}개)
              </h4>
              <div className="max-h-48 overflow-y-auto border border-gray-100 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-1.5 text-left text-gray-500">x</th>
                      <th className="px-3 py-1.5 text-left text-gray-500">y</th>
                      <th className="px-3 py-1.5 text-left text-gray-500">V (V)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {[...measurements].sort((a, b) => a.y - b.y || a.x - b.x).map((m, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-1 font-mono text-gray-600">{m.x}</td>
                        <td className="px-3 py-1 font-mono text-gray-600">{m.y}</td>
                        <td className="px-3 py-1 font-mono font-semibold text-blue-600">{Number(m.V).toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── 미니 격자 (활성 세션 인라인 표시용) ─────────────────────────
function MiniGrid({ measurements, electrodeConfig }) {
  const CELL = 28
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
            const V      = map.get(`${col},${row}`)
            const isCom  = comCoord && col === comCoord.x && row === comCoord.y
            const filled = V !== undefined || isCom
            return (
              <div
                key={col}
                style={{ width: CELL, height: CELL }}
                className={[
                  'rounded-sm flex items-center justify-center text-center',
                  isCom  ? 'bg-indigo-500' :
                  filled ? 'bg-blue-400'   : 'bg-gray-100'
                ].join(' ')}
                title={filled ? `(${col},${row}) = ${isCom ? '0.0' : Number(V).toFixed(1)}V` : `(${col},${row})`}
              >
                {filled && (
                  <span className="text-white font-bold" style={{ fontSize: 7 }}>
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

// ── 메인 페이지 ─────────────────────────────────────────────────
export default function StudentView() {
  const { uid }  = useParams()
  const navigate = useNavigate()
  const [student,  setStudent]  = useState(null)
  const [sessions, setSessions] = useState([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    getUser(uid).then(setStudent)
    const unsub = subscribeStudentSessions(uid, (data) => {
      setSessions(data)
      setLoading(false)
    })
    return unsub
  }, [uid])

  const completedSessions = sessions.filter(s => s.step === 3)
  const activeSessions    = sessions.filter(s => timeDiffSec(s.updatedAt) < 120)
  const avgScore = completedSessions
    .filter(s => s.score != null)
    .reduce((acc, s, _, arr) => acc + s.score / arr.length, 0)

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200 px-5 py-3 flex items-center gap-3 shadow-sm">
        <button onClick={() => navigate('/admin')}
          className="text-gray-400 hover:text-gray-600 transition-colors p-1">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-gray-900 flex items-center gap-2">
            {student?.name || '학생'} 실험 현황
            {activeSessions.length > 0 && (
              <span className="flex items-center gap-1 text-xs bg-blue-100 text-blue-600 rounded-full px-2 py-0.5 font-medium">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                실험 중
              </span>
            )}
          </h1>
          <p className="text-xs text-gray-500">{student?.email}
            {student?.class && <span className="ml-2 bg-gray-100 rounded px-1">{student.class}반</span>}
          </p>
        </div>
      </header>

      <main className="flex-1 p-5 max-w-5xl mx-auto w-full">
        {/* 요약 카드 */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: '전체 세션',   value: sessions.length,          color: 'text-gray-800' },
            { label: '완료',        value: completedSessions.length,  color: 'text-green-600' },
            { label: '현재 활성',   value: activeSessions.length,     color: 'text-blue-600' },
            { label: '평균 점수',   value: avgScore > 0 ? Math.round(avgScore) : '—', color: 'text-purple-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-xl p-3 shadow-sm border border-gray-200 text-center">
              <p className="text-xs text-gray-500">{label}</p>
              <p className={`text-2xl font-black mt-1 ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* 세션 목록 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold text-gray-700">실험 세션</h2>
            <div className="flex items-center gap-1.5 text-xs text-green-600">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              실시간 구독 중
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center text-gray-400 border border-gray-200">
              아직 진행한 실험이 없습니다.
            </div>
          ) : (
            sessions.map(session => (
              <SessionCard key={session.id} session={session} />
            ))
          )}
        </div>
      </main>
    </div>
  )
}
