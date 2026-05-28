import React, { useMemo } from 'react'
import Plot from 'react-plotly.js'
import { laplaceInterpolate } from '../services/interpolate.js'

const RESOLUTION = 40

/**
 * 3D 전위 지형도 컴포넌트 (Plotly surface chart)
 *
 * @param {Array<{x,y,V}>} measurements1 - 실험 1 측정값
 * @param {Array<{x,y,V}>} measurements2 - 실험 2 측정값 (비교 시)
 * @param {string} title1 - 실험 1 제목
 * @param {string} title2 - 실험 2 제목
 * @param {number} width - 차트 전체 폭
 * @param {number} height - 차트 높이
 */
export default function Surface3D({
  measurements1 = [],
  measurements2 = null,
  title1 = '실험 1 — 점전극',
  title2 = '실험 2 — 선전극',
  width = 700,
  height = 420
}) {
  // ── 격자 생성 ─────────────────────────────────────────────
  const { z1, x1, y1 } = useMemo(() => {
    if (!measurements1 || measurements1.length < 3) {
      return { z1: null, x1: [], y1: [] }
    }
    const grid = laplaceInterpolate(measurements1, RESOLUTION)
    const xs = Array.from({ length: RESOLUTION }, (_, i) => parseFloat((i * 7 / (RESOLUTION - 1)).toFixed(2)))
    const ys = Array.from({ length: RESOLUTION }, (_, i) => parseFloat((i * 7 / (RESOLUTION - 1)).toFixed(2)))
    return { z1: grid, x1: xs, y1: ys }
  }, [measurements1])

  const { z2, x2, y2 } = useMemo(() => {
    if (!measurements2 || measurements2.length < 3) {
      return { z2: null, x2: [], y2: [] }
    }
    const grid = laplaceInterpolate(measurements2, RESOLUTION)
    const xs = Array.from({ length: RESOLUTION }, (_, i) => parseFloat((i * 7 / (RESOLUTION - 1)).toFixed(2)))
    const ys = Array.from({ length: RESOLUTION }, (_, i) => parseFloat((i * 7 / (RESOLUTION - 1)).toFixed(2)))
    return { z2: grid, x2: xs, y2: ys }
  }, [measurements2])

  const showComparison = z2 !== null

  // ── Plotly 데이터 ─────────────────────────────────────────
  const trace1 = useMemo(() => ({
    type: 'surface',
    z: z1 || [[0]],
    x: x1,
    y: y1,
    colorscale: 'RdBu',
    reversescale: true,  // 고전압=빨강, 저전압=파랑
    showscale: true,
    colorbar: {
      title: { text: '전위 (V)', side: 'right' },
      thickness: 12,
      len: 0.7,
      x: showComparison ? 0.45 : 1.02
    },
    hovertemplate: 'x: %{x:.1f}<br>y: %{y:.1f}<br>V: %{z:.2f} V<extra></extra>'
  }), [z1, x1, y1, showComparison])

  const trace2 = useMemo(() => ({
    type: 'surface',
    z: z2 || [[0]],
    x: x2,
    y: y2,
    colorscale: 'RdBu',
    reversescale: true,
    showscale: true,
    colorbar: {
      title: { text: '전위 (V)', side: 'right' },
      thickness: 12,
      len: 0.7,
      x: 1.02
    },
    hovertemplate: 'x: %{x:.1f}<br>y: %{y:.1f}<br>V: %{z:.2f} V<extra></extra>'
  }), [z2, x2, y2])

  // ── Layout ────────────────────────────────────────────────
  const layout = useMemo(() => {
    if (showComparison) {
      return {
        title: { text: '실험 1 vs 실험 2 — 3D 전위 지형도 비교', font: { size: 14 } },
        width,
        height,
        margin: { l: 10, r: 60, t: 50, b: 10 },
        paper_bgcolor: '#f8fafc',
        scene: {
          domain: { x: [0, 0.48], y: [0, 1] },
          xaxis: { title: { text: 'x' } },
          yaxis: { title: { text: 'y' } },
          zaxis: { title: { text: 'V (볼트)' } },
          camera: { eye: { x: 1.5, y: -1.5, z: 1.2 } }
        },
        scene2: {
          domain: { x: [0.52, 1], y: [0, 1] },
          xaxis: { title: { text: 'x' } },
          yaxis: { title: { text: 'y' } },
          zaxis: { title: { text: 'V (볼트)' } },
          camera: { eye: { x: 1.5, y: -1.5, z: 1.2 } }
        },
        annotations: [
          {
            text: title1, x: 0.24, y: 1.02, xref: 'paper', yref: 'paper',
            xanchor: 'center', showarrow: false, font: { size: 12, color: '#374151' }
          },
          {
            text: title2, x: 0.76, y: 1.02, xref: 'paper', yref: 'paper',
            xanchor: 'center', showarrow: false, font: { size: 12, color: '#374151' }
          }
        ]
      }
    }

    return {
      title: { text: `${title1} — 3D 전위 지형도`, font: { size: 14 } },
      width,
      height,
      margin: { l: 10, r: 60, t: 50, b: 10 },
      paper_bgcolor: '#f8fafc',
      scene: {
        xaxis: { title: { text: 'x' } },
        yaxis: { title: { text: 'y' } },
        zaxis: { title: { text: 'V (볼트)' } },
        camera: { eye: { x: 1.5, y: -1.5, z: 1.2 } }
      }
    }
  }, [showComparison, title1, title2, width, height])

  // 두 번째 trace는 scene2에 연결
  const trace2WithScene = useMemo(() => ({
    ...trace2,
    scene: 'scene2'
  }), [trace2])

  const config = {
    displayModeBar: true,
    modeBarButtonsToRemove: ['sendDataToCloud', 'toImage'],
    responsive: true
  }

  if (!z1) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-400"
        style={{ width, height }}
      >
        <div className="text-center">
          <svg className="w-12 h-12 mx-auto mb-2 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <p>측정 데이터가 부족합니다</p>
          <p className="text-sm mt-1">Step 1에서 전위값을 입력하세요</p>
        </div>
      </div>
    )
  }

  return (
    <Plot
      data={showComparison ? [trace1, trace2WithScene] : [trace1]}
      layout={layout}
      config={config}
      style={{ borderRadius: '12px', overflow: 'hidden' }}
    />
  )
}
