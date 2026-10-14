// 실험 웹 보고서 그래프 설정 — Motion Tracker(public/js/graphs.js)의 자유 물체 운동 그래프와
// 같은 모양이 나오도록 옮겨 온 것이다. 저장된 측정점은 {t, x, y}(첫 점 기준 상대값)이다.
import { Chart, ScatterController, LineElement, PointElement, LinearScale, Title, Legend, Tooltip } from 'chart.js'

Chart.register(ScatterController, LineElement, PointElement, LinearScale, Title, Legend, Tooltip)

const AXIS  = { color: '#444' }
const GRID  = { color: 'rgba(0,0,0,0.07)' }
const TICK  = { color: '#555' }
const TITLE_COLOR  = '#1a1a2e'
const LEGEND_COLOR = '#333'

const legend = () => ({ legend: { labels: { color: LEGEND_COLOR } } })

function freeBase(xLabel, yLabel) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    scales: {
      x: { min: 0, title: { display: true, text: xLabel, ...AXIS }, ticks: TICK, grid: GRID },
      y: { title: { display: true, text: yLabel, ...AXIS }, ticks: TICK, grid: GRID },
    },
  }
}

// 회귀 곡선: 측정 구간을 40등분해 매끄러운 점선으로
function fitLine(points, f, label) {
  const t1 = points[points.length - 1].t
  const data = Array.from({ length: 41 }, (_, i) => { const t = t1 * i / 40; return { x: t, y: f(t) } })
  return {
    label, data,
    borderColor: '#555', backgroundColor: 'transparent',
    pointRadius: 0, showLine: true, borderWidth: 1.5, borderDash: [6, 4],
  }
}

/** @returns {import('chart.js').ChartConfiguration} */
export function chartConfig(kind, { points, unit = 'cm', label = '물체', fit = null }) {
  if (kind === 'xt') {
    const datasets = [{
      label: `x (${unit})`,
      data: points.map(p => ({ x: p.t, y: p.x })),
      borderColor: '#1565c0', backgroundColor: 'rgba(21,101,192,0.65)',
      pointRadius: 5, showLine: true, borderWidth: 1.5,
    }]
    if (fit?.vx != null && fit?.x0 != null) {
      datasets.push(fitLine(points, t => fit.x0 + fit.vx * t, `피팅 x = ${fit.x0.toFixed(2)} + ${fit.vx.toFixed(2)}t`))
    }
    return {
      type: 'scatter', data: { datasets },
      options: { ...freeBase('시간 (s)', `x 위치 (${unit})`), plugins: { ...legend(), title: { display: true, text: `${label} — x-t 그래프`, color: TITLE_COLOR } } },
    }
  }
  if (kind === 'yt') {
    const datasets = [{
      label: `y (${unit})`,
      data: points.map(p => ({ x: p.t, y: p.y })),
      borderColor: '#c62828', backgroundColor: 'rgba(198,40,40,0.65)',
      pointRadius: 5, showLine: true, borderWidth: 1.5,
    }]
    if (fit?.ay != null && fit?.y0 != null && fit?.vy0 != null) {
      datasets.push(fitLine(points, t => fit.y0 + fit.vy0 * t + 0.5 * fit.ay * t * t,
        `피팅 y = ${fit.y0.toFixed(2)} + ${fit.vy0.toFixed(2)}t + ½·${fit.ay.toFixed(1)}t²`))
    }
    return {
      type: 'scatter', data: { datasets },
      options: { ...freeBase('시간 (s)', `y 위치 (${unit})`), plugins: { ...legend(), title: { display: true, text: `${label} — y-t 그래프`, color: TITLE_COLOR } } },
    }
  }
  // x-y 궤적: 화면과 같은 방향(아래가 +)
  return {
    type: 'scatter',
    data: {
      datasets: [{
        label: '궤적',
        data: points.map(p => ({ x: p.x, y: p.y })),
        borderColor: '#6a1b9a', backgroundColor: 'rgba(106,27,154,0.65)',
        pointRadius: 5, showLine: true, borderWidth: 1.5,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      scales: {
        x: { title: { display: true, text: `x (${unit})`, ...AXIS }, ticks: TICK, grid: GRID },
        y: { reverse: true, title: { display: true, text: `y (${unit}, ↓+)`, ...AXIS }, ticks: TICK, grid: GRID },
      },
      plugins: { ...legend(), title: { display: true, text: `${label} — 궤적 (x-y)`, color: TITLE_COLOR } },
    },
  }
}

export { Chart }

// Motion Tracker freeMotion.js fitSummaryLines와 같은 문구
export function fitSummaryLines(fit, unit) {
  if (!fit) return ['회귀 분석: 점이 4개 이상 필요합니다.']
  const f = (v, d) => (v != null && isFinite(v)) ? v.toFixed(d) : '-'
  const lines = [
    `x-t 1차 회귀: vx = ${f(fit.vx, 2)} ${unit}/s  (R² = ${f(fit.vxR2, 4)})`,
    `y-t 2차 회귀: a = ${f(fit.ay, 1)} ${unit}/s²  (R² = ${f(fit.ayR2, 4)}, 아래 방향 +)`,
  ]
  if (unit === 'cm' && fit.ay != null) {
    lines.push(`→ 가속도 ${f(fit.ay / 100, 2)} m/s²  (중력가속도 9.8 m/s²와 비교: 오차 ${f(Math.abs(fit.ay / 100 - 9.8) / 9.8 * 100, 1)}%)`)
  }
  if (fit.v0 != null) {
    const v0m = unit === 'cm' ? `  (${f(fit.v0 / 100, 2)} m/s)` : ''
    lines.push(`초기 속력 v₀ = ${f(fit.v0, 1)} ${unit}/s${v0m},  발사 각도 θ = ${f(fit.angleDeg, 1)}°  (수평 기준, 위쪽 +)`)
  }
  return lines
}
