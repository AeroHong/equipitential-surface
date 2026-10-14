import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Chart, chartConfig, fitSummaryLines } from './charts.js'
import ExperimentResultView from '../ExperimentResultView.jsx'
import { formatFitValue } from '../../services/experiments.js'

// Motion Tracker 결과 화면(GridStack 12열, 행 40px)을 그대로 옮긴 웹 보고서.
// 설계 폭으로 그린 뒤 컨테이너 폭에 맞춰 통째로 축소한다 — 좁은 칸에서도 학생이 정한 배치 그대로 보인다.
const DESIGN_W  = 1248          // 12열일 때 설계 폭 (Motion Tracker 1280px 화면 기준)
const ROW_RATIO = 40 / 104       // 행 높이 / 열 폭 — 결과 화면과 같은 가로세로 비율
const MAX_W     = 1400
const GAP       = 12
const HEADER_H = 64

const TITLES = {
  track: '궤적 이미지', xt: 'x-t 그래프', yt: 'y-t 그래프', xy: '궤적 (x-y)',
  table: '측정 데이터', fit: '회귀 분석',
}

/**
 * 실험 결과 한 건을 보고서로 보여준다. 배치 정보가 없는 예전 제출물은 PNG 방식으로 대신 표시.
 * @param {{result: object, compact?: boolean}} props compact: 크게 보기·PNG 링크 줄 숨김
 */
export default function ExperimentReport({ result, compact = false }) {
  const [zoomed, setZoomed] = useState(false)
  if (!result) return null
  if (!Array.isArray(result.layout) || result.layout.length === 0) {
    return <ExperimentResultView result={result} />
  }
  const updated = result.updatedAt?.toDate?.()

  return (
    <div className="space-y-2">
      <ScaledReport result={result} />
      {!compact && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-400">
          <span>
            {updated ? `${updated.toLocaleString('ko-KR')} 제출` : ''}
            {result.attemptCount > 1 ? ` · ${result.attemptCount}회째` : ''}
          </span>
          <span className="flex gap-3">
            <button type="button" onClick={() => setZoomed(true)} className="text-indigo-600 hover:underline">🔍 크게 보기</button>
            {result.pngUrl && <a href={result.pngUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">PNG로 보기</a>}
          </span>
        </div>
      )}
      {zoomed && (
        <div
          className="fixed inset-0 z-50 overflow-auto bg-black/60 p-4"
          onMouseDown={e => { if (e.target === e.currentTarget) setZoomed(false) }}
        >
          <div className="mx-auto max-w-[1300px] rounded-2xl bg-white p-3">
            <div className="mb-2 flex justify-end">
              <button onClick={() => setZoomed(false)} className="text-2xl leading-none text-slate-400 hover:text-slate-700" aria-label="닫기">×</button>
            </div>
            <ScaledReport result={result} />
          </div>
        </div>
      )}
    </div>
  )
}

function ScaledReport({ result }) {
  const outerRef = useRef(null)
  const [boxW, setBoxW] = useState(DESIGN_W)
  // 조작용 카드가 빠져 비는 오른쪽 열은 잘라내고, 쓰인 열만으로 폭을 채운다
  const cols = Math.max(1, ...result.layout.map(c => c.x + c.w))
  const rows = Math.max(1, ...result.layout.map(c => c.y + c.h))
  const designW = Math.max(DESIGN_W * cols / 12, Math.min(boxW, MAX_W))
  const rowH    = (designW / cols) * ROW_RATIO
  const designH = HEADER_H + rows * rowH + GAP
  const scale   = Math.min(1, boxW / designW) || 1

  useLayoutEffect(() => {
    const el = outerRef.current
    if (!el) return
    const update = () => setBoxW(el.clientWidth || DESIGN_W)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={outerRef} className="w-full overflow-hidden" style={{ height: designH * scale }}>
      <div style={{ width: designW, height: designH, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
        <ReportHeader result={result} />
        <div
          className="relative grid"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridAutoRows: `${rowH}px`,
            gap: 0,
            height: rows * rowH,
          }}
        >
          {result.layout.map(c => (
            <div
              key={c.id}
              style={{ gridColumn: `${c.x + 1} / span ${c.w}`, gridRow: `${c.y + 1} / span ${c.h}`, padding: GAP / 2 }}
            >
              <div className="flex h-full flex-col overflow-hidden rounded-xl border border-[#dde3ee] bg-white shadow-sm">
                <div className="flex-shrink-0 border-b border-[#e3e8f0] px-3 py-1.5 text-sm font-bold text-[#1565c0]">
                  {TITLES[c.id] || c.id}
                </div>
                <div className="relative min-h-0 flex-1 p-2.5">
                  <CardBody id={c.id} result={result} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ReportHeader({ result }) {
  const c = result.calib
  return (
    <div className="flex items-end justify-between px-1.5" style={{ height: HEADER_H }}>
      <div>
        <div className="text-xl font-bold text-[#1a1a2e]">{result.motionLabel || '자유 물체 운동'}</div>
        <div className="text-sm text-gray-600">{result.studentName}</div>
      </div>
      <div className="pb-1 text-xs text-gray-500">
        {c ? `보정: ${formatFitValue(c.pxDist, 1)}px = ${c.realLengthCm}cm (${formatFitValue(c.scale, 4)} cm/px)` : '보정: 미설정 (px 단위)'}
        {result.fps ? ` · ${result.fps}fps` : ''}
      </div>
    </div>
  )
}

function CardBody({ id, result }) {
  const unit = result.unit || 'cm'
  if (id === 'track') {
    return result.trackPngUrl
      ? <img src={result.trackPngUrl} alt="궤적 이미지" className="absolute inset-2.5 h-[calc(100%-20px)] w-[calc(100%-20px)] rounded-md bg-[#111] object-contain" />
      : <p className="text-xs text-gray-400">궤적 이미지가 없습니다.</p>
  }
  if (id === 'xt' || id === 'yt' || id === 'xy') {
    return <ChartBox kind={id} points={result.points || []} unit={unit} label={result.motionLabel || '자유 물체 운동'} fit={result.fit} />
  }
  if (id === 'fit') {
    return (
      <div className="space-y-1 text-[13px] leading-relaxed text-gray-800">
        {fitSummaryLines(result.fit, unit).map((l, i) => <div key={i}>{l}</div>)}
      </div>
    )
  }
  if (id === 'table') return <DataTable points={result.points || []} unit={unit} />
  return null
}

function ChartBox({ kind, points, unit, label, fit }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!ref.current || points.length === 0) return
    const chart = new Chart(ref.current, chartConfig(kind, { points, unit, label, fit }))
    return () => chart.destroy()
  }, [kind, points, unit, label, fit])
  if (points.length === 0) return <p className="text-xs text-gray-400">측정 점이 없습니다.</p>
  return <div className="absolute inset-2.5"><canvas ref={ref} /></div>
}

function DataTable({ points, unit }) {
  const f = (v, d = 2) => (v != null && isFinite(v)) ? v.toFixed(d) : '-'
  return (
    <div className="h-full overflow-auto">
      <table className="w-auto border-collapse text-[13px] tabular-nums">
        <thead className="sticky top-0">
          <tr className="bg-[#1565c0] text-white">
            {['번호', '시간(s)', `x (${unit})`, `Δx (${unit})`, `y (${unit})`, `Δy (${unit})`].map(h => (
              <th key={h} className="whitespace-nowrap px-2 py-1 text-right font-semibold first:text-center">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {points.map((p, i) => {
            const q = points[i - 1]
            return (
              <tr key={i} className="even:bg-[#f5f7fa]">
                <td className="border border-[#dde3ee] px-2 py-0.5 text-center font-semibold text-gray-500">{i + 1}</td>
                <td className="whitespace-nowrap border border-[#dde3ee] px-2 py-0.5 text-right">{f(p.t, 3)}</td>
                <td className="whitespace-nowrap border border-[#dde3ee] px-2 py-0.5 text-right">{f(p.x)}</td>
                <td className="whitespace-nowrap border border-[#dde3ee] px-2 py-0.5 text-right">{q ? f(p.x - q.x) : '-'}</td>
                <td className="whitespace-nowrap border border-[#dde3ee] px-2 py-0.5 text-right">{f(p.y)}</td>
                <td className="whitespace-nowrap border border-[#dde3ee] px-2 py-0.5 text-right">{q ? f(p.y - q.y) : '-'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
