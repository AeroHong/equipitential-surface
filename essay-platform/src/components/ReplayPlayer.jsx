import React, { useEffect, useMemo, useRef, useState } from 'react'
import { htmlToPlainText, sanitizeHtml } from '../utils/richText.js'

function minMax(values) {
  let min = Infinity
  let max = -Infinity
  for (const v of values) {
    if (v < min) min = v
    if (v > max) max = v
  }
  return [min, max]
}

function formatDuration(ms) {
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `${sec}초`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}분 ${sec % 60}초`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간 ${min % 60}분`
  const day = Math.floor(hr / 24)
  return `${day}일 ${hr % 24}시간`
}

function formatClock(t) {
  if (!Number.isFinite(t)) return '—'
  return new Date(t).toLocaleString('ko-KR', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
  })
}

const KEY_COLOR = {
  char: 'bg-blue-400',
  backspace: 'bg-red-400',
  enter: 'bg-gray-400',
  space: 'bg-gray-300',
  other: 'bg-gray-300'
}

const SPEED_OPTIONS = [1, 10, 60, 300]

/**
 * inputLogs(텍스트 스냅샷)/keydownLogs(타이밍)/pasteLogs(붙여넣기)를 하나의 타임라인으로 재생.
 * 슬라이더는 절대 시각 기준이라 드래그로 자유롭게 아무 시점이나 즉시 이동 가능하고,
 * 재생 버튼은 배속(최대 300x)으로 장시간 유휴 구간을 빠르게 건너뛸 수 있게 한다.
 */
export default function ReplayPlayer({ inputEvents, keydownEvents, pasteEvents, aiFlags }) {
  const allT = useMemo(
    () => [...inputEvents.map(e => e.t), ...keydownEvents.map(e => e.t), ...pasteEvents.map(e => e.t)],
    [inputEvents, keydownEvents, pasteEvents]
  )
  const [tMin, tMax] = useMemo(() => (allT.length ? minMax(allT) : [0, 0]), [allT])

  const [currentT, setCurrentT] = useState(tMin)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(60)

  useEffect(() => { setCurrentT(tMin) }, [tMin])

  useEffect(() => {
    if (!playing) return
    let raf
    let last = performance.now()
    function step(now) {
      const delta = now - last
      last = now
      setCurrentT(t => {
        const next = t + delta * speed
        if (next >= tMax) {
          setPlaying(false)
          return tMax
        }
        return next
      })
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [playing, speed, tMax])

  // ev.value는 essay 에디터가 textarea였을 땐 순수 텍스트, 지금은 서식이 담긴 HTML이다
  // (과거 로그도 태그가 없을 뿐 그대로 통과하므로 하위호환된다). sanitizeHtml로 한 번 더
  // 걸러서 그리는 이유는, 학생 계정이 devtools로 Firestore 문서에 직접 위험한 태그를
  // 심어놨더라도 그게 여기(교사 화면)에서 실행되지 않게 하기 위해서다.
  const currentHtml = useMemo(() => {
    let html = ''
    for (const ev of inputEvents) {
      if (ev.t > currentT) break
      html = ev.value
    }
    return sanitizeHtml(html)
  }, [inputEvents, currentT])

  const finalPlainText = inputEvents.length ? htmlToPlainText(inputEvents[inputEvents.length - 1].value) : ''
  const finalCharCount = finalPlainText.length
  const pastedCharTotal = pasteEvents.reduce((sum, e) => sum + (e.charCount || 0), 0)
  const pasteRatio = finalCharCount > 0 ? Math.round((pastedCharTotal / finalCharCount) * 100) : 0

  if (allT.length === 0) {
    return <div className="text-center text-gray-400 py-12 text-sm">작성 로그가 없습니다.</div>
  }

  const range = Math.max(tMax - tMin, 1)

  return (
    <div className="space-y-4">
      {/* 통계 패널 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: '총 소요시간', value: formatDuration(tMax - tMin) },
          { label: '키 입력 수', value: keydownEvents.length.toLocaleString() },
          { label: '붙여넣기', value: `${pasteEvents.length}회 · ${pastedCharTotal}자` },
          { label: '붙여넣기 비율', value: `${pasteRatio}%`, warn: pasteRatio >= 30 }
        ].map(({ label, value, warn }) => (
          <div key={label} className={`bg-white rounded-xl p-3 border text-center ${warn ? 'border-red-200' : 'border-gray-200'}`}>
            <p className="text-xs text-gray-400">{label}</p>
            <p className={`text-lg font-bold mt-0.5 ${warn ? 'text-red-600' : 'text-gray-800'}`}>{value}</p>
          </div>
        ))}
      </div>

      {aiFlags?.phraseMatches?.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-xs text-amber-700">
          AI 의심 표현 감지: {aiFlags.phraseMatches.map(p => `"${p}"`).join(', ')}
          {aiFlags.markdownHits && ' · 마크다운 서식 흔적 있음'}
        </div>
      )}

      {/* 재생 텍스트 박스 — 학생이 쓴 서식(굵게/기울임/목록 등)을 그대로 재생한다.
          [&_ul]/[&_ol]은 EssayEditor.jsx와 같은 목록 스타일. */}
      {currentHtml ? (
        <div
          className="rounded-2xl border border-gray-200 bg-white px-5 py-4 min-h-[220px] text-[15px] leading-relaxed text-gray-800 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
          dangerouslySetInnerHTML={{ __html: currentHtml }}
        />
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4 min-h-[220px] text-[15px] leading-relaxed text-gray-300">
          (아직 입력 없음)
        </div>
      )}

      {/* 타임라인 */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setPlaying(p => !p)}
            className="w-9 h-9 flex-shrink-0 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition-colors"
          >
            {playing ? (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg>
            ) : (
              <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            )}
          </button>
          <input
            type="range"
            min={tMin}
            max={tMax}
            value={currentT}
            onChange={e => { setPlaying(false); setCurrentT(Number(e.target.value)) }}
            className="flex-1 accent-blue-600"
          />
          <div className="flex gap-1 flex-shrink-0">
            {SPEED_OPTIONS.map(s => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`text-xs px-2 py-1 rounded-lg font-medium transition-colors ${speed === s ? 'bg-blue-100 text-blue-700' : 'text-gray-400 hover:bg-gray-100'}`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-between text-xs text-gray-400">
          <span>{formatClock(tMin)}</span>
          <span className="font-medium text-gray-600">{formatClock(currentT)}</span>
          <span>{formatClock(tMax)}</span>
        </div>

        {/* 키 입력 리듬 그래프 */}
        <div className="relative h-6 bg-gray-50 rounded-lg overflow-hidden">
          {keydownEvents.map((ev, i) => (
            <div
              key={i}
              className={`absolute top-0 bottom-0 w-[2px] ${KEY_COLOR[ev.k] || 'bg-gray-300'}`}
              style={{ left: `${((ev.t - tMin) / range) * 100}%` }}
            />
          ))}
          {pasteEvents.map(ev => (
            <div
              key={ev.id}
              title={`붙여넣기 ${ev.charCount}자: ${ev.text.slice(0, 80)}${ev.text.length > 80 ? '…' : ''}`}
              className="absolute top-0 bottom-0 w-1 bg-orange-500 cursor-help"
              style={{ left: `${((ev.t - tMin) / range) * 100}%` }}
            />
          ))}
          {/* 현재 위치 표시 */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-blue-600"
            style={{ left: `${((currentT - tMin) / range) * 100}%` }}
          />
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-400">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> 입력</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> 삭제</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block" /> 붙여넣기</span>
        </div>
      </div>
    </div>
  )
}
