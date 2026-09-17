import React, { useEffect, useMemo, useState } from 'react'
import { htmlToPlainText } from '../utils/richText.js'
import { sanitizeAnswerHtml } from '../utils/sanitizeHtml.js'
import { computeSurvivingPaste } from '../utils/pasteProvenance.js'
import { renderMathInElement } from '../utils/mathExpression.js'

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

// 보고서를 며칠에 걸쳐 쓰는 경우, 며칠 동안의 무입력 시간이 타임라인 폭 대부분을 차지해서
// 실제로 입력이 몰린 구간이 눈에 안 보일 정도로 눌려버린다. GAP_THRESHOLD_MS 이상 비어있는
// 구간은 "건너뛴 구간"으로 보고, 실제 길이와 무관하게 GAP_VIRTUAL_MS만큼의 고정 폭만
// 차지하게 압축한다(막대 위 표시용 "가상 시간"). 재생 배속도 이 가상 시간 기준으로 진행되므로
// 며칠짜리 공백을 몇 초 안에 자연스럽게 건너뛴다.
const GAP_THRESHOLD_MS = 10 * 60 * 1000
const GAP_VIRTUAL_MS = 20 * 1000

function buildSegments(sortedTimes, tMin, tMax) {
  const segments = []
  let cursor = tMin
  for (let i = 1; i < sortedTimes.length; i++) {
    const gap = sortedTimes[i] - sortedTimes[i - 1]
    if (gap >= GAP_THRESHOLD_MS) {
      segments.push({ type: 'active', start: cursor, end: sortedTimes[i - 1] })
      segments.push({ type: 'gap', start: sortedTimes[i - 1], end: sortedTimes[i] })
      cursor = sortedTimes[i]
    }
  }
  segments.push({ type: 'active', start: cursor, end: tMax })

  let acc = 0
  for (const seg of segments) {
    seg.virtualLen = seg.type === 'gap' ? GAP_VIRTUAL_MS : Math.max(0, seg.end - seg.start)
    seg.virtualStart = acc
    acc += seg.virtualLen
  }
  return { segments, totalVirtual: acc }
}

function realToVirtual(segments, t) {
  for (const seg of segments) {
    if (t <= seg.start) return seg.virtualStart
    if (t <= seg.end) {
      const span = seg.end - seg.start
      const frac = span > 0 ? (t - seg.start) / span : 0
      return seg.virtualStart + frac * seg.virtualLen
    }
  }
  const last = segments[segments.length - 1]
  return last ? last.virtualStart + last.virtualLen : 0
}

function virtualToReal(segments, v) {
  for (const seg of segments) {
    if (v <= seg.virtualStart + seg.virtualLen) {
      const local = v - seg.virtualStart
      const frac = seg.virtualLen > 0 ? local / seg.virtualLen : 0
      return seg.start + frac * (seg.end - seg.start)
    }
  }
  const last = segments[segments.length - 1]
  return last ? last.end : v
}

/**
 * inputLogs(텍스트 스냅샷)/keydownLogs(타이밍)/pasteLogs(붙여넣기)를 하나의 타임라인으로 재생.
 * 실제 시간이 아니라 "압축된 가상 시간" 기준으로 움직인다(위 buildSegments) — 무입력 구간을
 * 건너뛰기 위함. 막대를 드래그하거나 클릭하면 즉시 그 시점으로 이동하고, 재생 버튼은 배속
 * (최대 300x)으로 진행한다.
 */
export default function ReplayPlayer({ inputEvents, keydownEvents, pasteEvents, aiFlags }) {
  const replayRef = React.useRef(null)
  const allT = useMemo(
    () => [...inputEvents.map(e => e.t), ...keydownEvents.map(e => e.t), ...pasteEvents.map(e => e.t)],
    [inputEvents, keydownEvents, pasteEvents]
  )
  const [tMin, tMax] = useMemo(() => (allT.length ? minMax(allT) : [0, 0]), [allT])

  const { segments, totalVirtual } = useMemo(() => {
    const sorted = [...new Set(allT)].sort((a, b) => a - b)
    return buildSegments(sorted, tMin, tMax)
  }, [allT, tMin, tMax])

  const activeDurationMs = useMemo(
    () => segments.filter(s => s.type === 'active').reduce((sum, s) => sum + (s.end - s.start), 0),
    [segments]
  )

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
        const v = realToVirtual(segments, t) + delta * speed
        if (v >= totalVirtual) {
          setPlaying(false)
          return tMax
        }
        return virtualToReal(segments, v)
      })
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [playing, speed, tMax, segments, totalVirtual])

  // ev.value는 essay 에디터가 textarea였을 땐 순수 텍스트, 지금은 서식이 담긴 HTML이다
  // (과거 로그도 태그가 없을 뿐 그대로 통과하므로 하위호환된다). sanitizeAnswerHtml로 한 번 더
  // 걸러서 그리는 이유는, 학생 계정이 devtools로 Firestore 문서에 직접 위험한 태그를
  // 심어놨더라도 그게 여기(교사 화면)에서 실행되지 않게 하기 위해서다.
  const currentHtml = useMemo(() => {
    let html = ''
    for (const ev of inputEvents) {
      if (ev.t > currentT) break
      html = ev.value
    }
    return sanitizeAnswerHtml(html)
  }, [inputEvents, currentT])

  const pastedCharTotal = pasteEvents.reduce((sum, e) => sum + (e.charCount || 0), 0)

  useEffect(() => { renderMathInElement(replayRef.current) }, [currentHtml])

  // 붙여넣었다가 지우고 다시 직접 입력한 부분은 "붙여넣기"로 세지 않는다 — 최종본에
  // 실제로 살아남은 붙여넣기 글자만 비율에 반영한다(utils/pasteProvenance.js).
  const { finalLength, survivingPastedLength } = useMemo(
    () => computeSurvivingPaste(inputEvents, pasteEvents),
    [inputEvents, pasteEvents]
  )
  const pasteRatio = finalLength > 0 ? Math.round((survivingPastedLength / finalLength) * 100) : 0

  if (allT.length === 0) {
    return <div className="text-center text-gray-400 py-12 text-sm">작성 로그가 없습니다.</div>
  }

  const currentVirtual = realToVirtual(segments, currentT)

  function seekTo(t) {
    setPlaying(false)
    setCurrentT(t)
  }

  function handleBarClick(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    seekTo(virtualToReal(segments, frac * totalVirtual))
  }

  return (
    <div className="space-y-4">
      {/* 통계 패널 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: '실제 작성 시간', value: formatDuration(activeDurationMs) },
          { label: '키 입력 수', value: keydownEvents.length.toLocaleString() },
          { label: '붙여넣기', value: `${pasteEvents.length}회 · ${pastedCharTotal}자` },
          { label: '붙여넣기 비율(최종본 기준)', value: `${pasteRatio}%`, warn: pasteRatio >= 30 }
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

      {/* 재생 텍스트 박스 — 학생이 쓴 서식(굵게/기울임/목록/이미지 등)을 그대로 재생한다.
          [&_ul]/[&_ol]/[&_img]는 EssayEditor.jsx와 같은 스타일. */}
      {currentHtml ? (
        <div
          ref={replayRef}
          className="rounded-2xl border border-gray-200 bg-white px-5 py-4 min-h-[220px] text-[15px] leading-relaxed text-gray-800 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg"
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
            min={0}
            max={totalVirtual}
            value={currentVirtual}
            onChange={e => seekTo(virtualToReal(segments, Number(e.target.value)))}
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

        {/* 붙여넣기 지점 "!" 표시 — 클릭하면 그 시점으로 바로 이동 */}
        {pasteEvents.length > 0 && (
          <div className="relative h-4">
            {pasteEvents.map(ev => (
              <button
                key={ev.id}
                onClick={() => seekTo(ev.t)}
                title={`붙여넣기 ${ev.charCount}자로 이동`}
                style={{ left: `${(realToVirtual(segments, ev.t) / totalVirtual) * 100}%` }}
                className="absolute -translate-x-1/2 w-4 h-4 rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center hover:bg-orange-600 transition-colors"
              >
                !
              </button>
            ))}
          </div>
        )}

        {/* 키 입력 리듬 그래프 — 클릭하면 그 지점으로 이동, 회색 줄무늬 구간은 압축된
            무입력 구간(실제 길이와 무관하게 일정 폭만 차지) */}
        <div
          onClick={handleBarClick}
          className="relative h-6 bg-gray-50 rounded-lg overflow-hidden cursor-pointer"
        >
          {segments.filter(s => s.type === 'gap').map((seg, i) => (
            <div
              key={i}
              title={`${formatDuration(seg.end - seg.start)} 건너뜀`}
              style={{
                left: `${(seg.virtualStart / totalVirtual) * 100}%`,
                width: `${(seg.virtualLen / totalVirtual) * 100}%`,
                backgroundImage: 'repeating-linear-gradient(45deg, rgba(0,0,0,0.06) 0 4px, transparent 4px 8px)'
              }}
              className="absolute top-0 bottom-0"
            />
          ))}
          {keydownEvents.map((ev, i) => (
            <div
              key={i}
              className={`absolute top-0 bottom-0 w-[2px] ${KEY_COLOR[ev.k] || 'bg-gray-300'}`}
              style={{ left: `${(realToVirtual(segments, ev.t) / totalVirtual) * 100}%` }}
            />
          ))}
          {pasteEvents.map(ev => (
            <div
              key={ev.id}
              title={`붙여넣기 ${ev.charCount}자: ${ev.text.slice(0, 80)}${ev.text.length > 80 ? '…' : ''}`}
              className="absolute top-0 bottom-0 w-1 bg-orange-500 cursor-help"
              style={{ left: `${(realToVirtual(segments, ev.t) / totalVirtual) * 100}%` }}
            />
          ))}
          {/* 현재 위치 표시 */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-blue-600 pointer-events-none"
            style={{ left: `${(currentVirtual / totalVirtual) * 100}%` }}
          />
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-400">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> 입력</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> 삭제</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block" /> 붙여넣기</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-gray-200 inline-block" /> 무입력 구간(압축됨)</span>
        </div>
      </div>
    </div>
  )
}
