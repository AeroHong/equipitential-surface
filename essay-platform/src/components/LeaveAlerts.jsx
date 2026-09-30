import React, { useEffect, useRef, useState } from 'react'
import { LEAVE_TYPE_LABELS } from '../utils/focusGuard.js'

const SOUND_KEY = 'essay.leaveAlertSound'
const TOAST_MS = 10000

function readSoundPref() {
  try { return localStorage.getItem(SOUND_KEY) !== 'off' } catch { return true }
}

function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.4)
    osc.onended = () => ctx.close()
  } catch { /* 소리는 부가 기능 */ }
}

function clock(ms) {
  return new Date(ms).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/**
 * 교사 대시보드의 화면 이탈 실시간 알림. 학생 화면(hooks/useFocusGuard.js)이 이탈 순간
 * 제출물의 leaveCount를 올리면, 이미 구독 중인 submissions에서 이전 값과 비교해 알아챈다.
 * 페이지를 처음 열었을 때의 값은 기준으로만 삼고 알림을 띄우지 않는다.
 *
 * @param {{submissions: Array, onSelect: (sub) => void}} props
 */
export default function LeaveAlerts({ submissions, onSelect }) {
  const prevCountsRef = useRef(null)
  const [alerts, setAlerts] = useState([]) // 최신순 {key, subId, name, type, count, at}
  const [toasts, setToasts] = useState([])
  const [logOpen, setLogOpen] = useState(false)
  const [soundOn, setSoundOn] = useState(readSoundPref)
  const [unseen, setUnseen] = useState(0)
  const soundOnRef = useRef(soundOn)
  soundOnRef.current = soundOn

  useEffect(() => {
    const counts = Object.fromEntries(submissions.map(s => [s.id, s.leaveCount || 0]))
    const prev = prevCountsRef.current
    prevCountsRef.current = counts
    if (!prev) return
    const fresh = submissions
      .filter(s => (s.leaveCount || 0) > (prev[s.id] || 0))
      .map(s => ({
        key: `${s.id}-${s.leaveCount}`,
        subId: s.id,
        name: s.studentName || '(이름 없음)',
        type: s.lastLeaveType,
        count: s.leaveCount,
        at: Date.now()
      }))
    if (!fresh.length) return
    setAlerts(a => [...fresh, ...a].slice(0, 200))
    setToasts(t => [...fresh, ...t].slice(0, 5))
    if (document.visibilityState === 'hidden') setUnseen(n => n + fresh.length)
    if (soundOnRef.current) beep()
    for (const f of fresh) {
      setTimeout(() => setToasts(t => t.filter(x => x.key !== f.key)), TOAST_MS)
    }
  }, [submissions])

  // 대시보드 탭이 뒤에 있어도 알 수 있게 탭 제목에 표시한다.
  useEffect(() => {
    const base = document.title.replace(/^\(⚠\d+\) /, '')
    document.title = unseen > 0 ? `(⚠${unseen}) ${base}` : base
  }, [unseen])
  useEffect(() => {
    function handleVisible() { if (document.visibilityState === 'visible') setUnseen(0) }
    document.addEventListener('visibilitychange', handleVisible)
    return () => {
      document.removeEventListener('visibilitychange', handleVisible)
      document.title = document.title.replace(/^\(⚠\d+\) /, '')
    }
  }, [])

  function toggleSound() {
    const next = !soundOn
    setSoundOn(next)
    try { localStorage.setItem(SOUND_KEY, next ? 'on' : 'off') } catch { /* 무시 */ }
  }

  function select(alert) {
    const sub = submissions.find(s => s.id === alert.subId)
    if (sub) onSelect(sub)
  }

  return (
    <>
      <div className="fixed right-4 top-16 z-40 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map(t => (
          <button
            key={t.key}
            onClick={() => select(t)}
            className="flex items-start gap-2 rounded-xl border border-red-200 bg-white px-3 py-2.5 text-left shadow-lg hover:bg-red-50"
          >
            <span className="text-lg">⚠️</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-red-700">{t.name} 화면 이탈</span>
              <span className="block text-xs text-gray-500">
                {LEAVE_TYPE_LABELS[t.type] || '화면 이탈'} · {t.count}회째 · {clock(t.at)}
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="fixed bottom-4 right-4 z-40">
        {logOpen ? (
          <div className="w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-gray-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
              <p className="text-sm font-bold text-gray-800">🚨 화면 이탈 알림</p>
              <div className="flex items-center gap-3">
                <button onClick={toggleSound} className="text-xs text-gray-500 hover:text-indigo-600">
                  {soundOn ? '🔔 소리 켜짐' : '🔕 소리 꺼짐'}
                </button>
                <button onClick={() => setLogOpen(false)} className="text-lg leading-none text-gray-400 hover:text-gray-600" aria-label="닫기">×</button>
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {alerts.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-gray-400">이 화면을 연 뒤로 감지된 이탈이 없습니다.</p>
              ) : alerts.map(a => (
                <button
                  key={a.key}
                  onClick={() => select(a)}
                  className="flex w-full items-center justify-between gap-2 border-b border-gray-50 px-4 py-2 text-left last:border-0 hover:bg-gray-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-gray-800">{a.name}</span>
                    <span className="block text-xs text-gray-400">{LEAVE_TYPE_LABELS[a.type] || '화면 이탈'} · {a.count}회째</span>
                  </span>
                  <span className="shrink-0 text-xs text-gray-400">{clock(a.at)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <button
            onClick={() => setLogOpen(true)}
            className={`rounded-full border px-4 py-2 text-sm font-medium shadow-lg ${alerts.length ? 'border-red-200 bg-red-50 text-red-700' : 'border-gray-200 bg-white text-gray-600'}`}
          >
            🚨 이탈 알림 {alerts.length > 0 && `(${alerts.length})`}
          </button>
        )}
      </div>
    </>
  )
}
