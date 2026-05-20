import React, { useRef, useEffect, useCallback } from 'react'
import * as d3 from 'd3'
import { idwInterpolate } from '../services/interpolate.js'
import { computeContours, getVoltageRange } from '../utils/equipotential.js'

const RESOLUTION = 50

/**
 * 전기력선 드로잉 캔버스 컴포넌트
 *
 * @param {Array<{x,y,V}>} measurements - 측정값
 * @param {Array} drawnLines - 기존 드로잉 선 (복원용)
 * @param {Array} aiLines - AI 계산 전기력선 [{points:[{x,y}]}]
 * @param {function} onDraw - 드로잉 완료 콜백 (lines 배열)
 * @param {number} width
 * @param {number} height
 * @param {object} electrodeConfig
 */
export default function FieldLineCanvas({
  measurements = [],
  drawnLines = [],
  aiLines = [],
  onDraw,
  width = 350,
  height = 350,
  electrodeConfig = null,
  readOnly = false
}) {
  const bgCanvasRef = useRef(null)   // 등전위선 배경
  const drawCanvasRef = useRef(null) // 학생 드로잉 레이어
  const isDrawing = useRef(false)
  const currentLine = useRef([])
  const allLines = useRef([...drawnLines])

  // ── 배경(등전위선) 렌더링 ──────────────────────────────────
  useEffect(() => {
    const canvas = bgCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, width, height)

    // 배경색
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(0, 0, width, height)

    if (measurements.length < 3) {
      ctx.fillStyle = '#94a3b8'
      ctx.font = '13px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('등전위선을 먼저 생성하세요', width / 2, height / 2)
      return
    }

    // 보간 & 등전위선 계산
    const grid = idwInterpolate(measurements, RESOLUTION)
    const contourData = computeContours(grid, RESOLUTION, 12)
    const { min: minV, max: maxV } = getVoltageRange(grid)

    // 등전위선 그리기
    const scaleX = width / RESOLUTION
    const scaleY = height / RESOLUTION

    for (const contour of contourData) {
      const t = maxV === minV ? 0.5 : (contour.value - minV) / (maxV - minV)
      const color = d3.interpolateViridis(t)
      ctx.strokeStyle = color
      ctx.lineWidth = 1.5
      ctx.globalAlpha = 0.8

      for (const polygon of contour.coordinates) {
        for (const ring of polygon) {
          if (ring.length < 2) continue
          ctx.beginPath()
          ctx.moveTo(ring[0][0] * scaleX, ring[0][1] * scaleY)
          for (let i = 1; i < ring.length; i++) {
            ctx.lineTo(ring[i][0] * scaleX, ring[i][1] * scaleY)
          }
          ctx.closePath()
          ctx.stroke()
        }
      }
    }

    ctx.globalAlpha = 1

    // 전극 표시
    if (electrodeConfig) {
      const ptScale = width / 8
      const drawElectrodeSymbol = (ex, ey, isPos) => {
        const px = Math.max(10, Math.min(width - 10, ex * ptScale + ptScale / 2))
        const py = Math.max(10, Math.min(height - 10, ey * ptScale + ptScale / 2))
        ctx.beginPath()
        ctx.arc(px, py, 9, 0, Math.PI * 2)
        ctx.fillStyle = isPos ? '#ef4444' : '#6366f1'
        ctx.fill()
        ctx.strokeStyle = 'white'
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.fillStyle = 'white'
        ctx.font = 'bold 12px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(isPos ? '+' : '−', px, py)
      }

      if (electrodeConfig.type === 'line_electrode') {
        ctx.strokeStyle = '#ef4444'
        ctx.lineWidth = 5
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(10, 4)
        ctx.lineTo(width - 10, 4)
        ctx.stroke()

        ctx.strokeStyle = '#6366f1'
        ctx.beginPath()
        ctx.moveTo(10, height - 4)
        ctx.lineTo(width - 10, height - 4)
        ctx.stroke()
      } else {
        if (electrodeConfig.positive) drawElectrodeSymbol(electrodeConfig.positive.x, electrodeConfig.positive.y, true)
        if (electrodeConfig.negative) drawElectrodeSymbol(electrodeConfig.negative.x, electrodeConfig.negative.y, false)
      }
    }

    // 경계선
    ctx.strokeStyle = '#cbd5e1'
    ctx.lineWidth = 1
    ctx.strokeRect(0, 0, width, height)
  }, [measurements, electrodeConfig, width, height])

  // ── 드로잉 레이어 렌더링 ──────────────────────────────────
  const redrawLines = useCallback(() => {
    const canvas = drawCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, width, height)

    // 학생 그림 (파란색)
    ctx.strokeStyle = '#2563eb'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    for (const line of allLines.current) {
      if (line.length < 2) continue
      ctx.beginPath()
      ctx.moveTo(line[0].x, line[0].y)
      for (let i = 1; i < line.length; i++) {
        ctx.lineTo(line[i].x, line[i].y)
      }
      ctx.stroke()
    }

    // AI 전기력선 (빨간색)
    if (aiLines.length > 0) {
      ctx.strokeStyle = '#ef4444'
      ctx.lineWidth = 2
      ctx.setLineDash([])

      for (const fieldLine of aiLines) {
        const pts = fieldLine.points
        if (!pts || pts.length < 2) continue
        ctx.beginPath()
        // AI 선의 좌표는 격자 0~7 기준 → 픽셀로 변환
        const toPixel = (coord) => (coord / 7) * width
        ctx.moveTo(toPixel(pts[0].x), toPixel(pts[0].y))
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(toPixel(pts[i].x), toPixel(pts[i].y))
        }
        ctx.stroke()

        // 화살표 (마지막 부분)
        if (pts.length >= 2) {
          const last = pts[pts.length - 1]
          const prev = pts[pts.length - 2]
          const angle = Math.atan2(
            toPixel(last.y) - toPixel(prev.y),
            toPixel(last.x) - toPixel(prev.x)
          )
          const ax = toPixel(last.x)
          const ay = toPixel(last.y)
          ctx.beginPath()
          ctx.moveTo(ax, ay)
          ctx.lineTo(ax - 8 * Math.cos(angle - 0.4), ay - 8 * Math.sin(angle - 0.4))
          ctx.moveTo(ax, ay)
          ctx.lineTo(ax - 8 * Math.cos(angle + 0.4), ay - 8 * Math.sin(angle + 0.4))
          ctx.stroke()
        }
      }
    }
  }, [aiLines, width, height])

  useEffect(() => {
    allLines.current = [...drawnLines]
    redrawLines()
  }, [drawnLines, redrawLines])

  useEffect(() => {
    redrawLines()
  }, [aiLines, redrawLines])

  // ── 터치/마우스 이벤트 ──────────────────────────────────
  function getPos(e, canvas) {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if (e.touches) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY
      }
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    }
  }

  function startDraw(e) {
    if (readOnly || aiLines.length > 0) return
    e.preventDefault()
    isDrawing.current = true
    const pos = getPos(e, drawCanvasRef.current)
    currentLine.current = [pos]
  }

  function moveDraw(e) {
    if (!isDrawing.current || readOnly || aiLines.length > 0) return
    e.preventDefault()
    const pos = getPos(e, drawCanvasRef.current)
    currentLine.current.push(pos)

    // 실시간 미리보기
    const canvas = drawCanvasRef.current
    const ctx = canvas.getContext('2d')
    redrawLines()

    const line = currentLine.current
    if (line.length > 1) {
      ctx.strokeStyle = '#2563eb'
      ctx.lineWidth = 2.5
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(line[0].x, line[0].y)
      for (let i = 1; i < line.length; i++) {
        ctx.lineTo(line[i].x, line[i].y)
      }
      ctx.stroke()
    }
  }

  function endDraw(e) {
    if (!isDrawing.current || readOnly || aiLines.length > 0) return
    e.preventDefault()
    isDrawing.current = false
    if (currentLine.current.length > 1) {
      allLines.current = [...allLines.current, [...currentLine.current]]
      onDraw && onDraw(allLines.current)
      redrawLines()
    }
    currentLine.current = []
  }

  return (
    <div className="relative" style={{ width, height }}>
      {/* 배경 캔버스 (등전위선) */}
      <canvas
        ref={bgCanvasRef}
        width={width}
        height={height}
        className="absolute top-0 left-0 rounded-lg"
        style={{ pointerEvents: 'none' }}
      />

      {/* 드로잉 캔버스 */}
      <canvas
        ref={drawCanvasRef}
        width={width}
        height={height}
        className="absolute top-0 left-0 rounded-lg no-scroll-touch"
        style={{
          cursor: readOnly || aiLines.length > 0 ? 'default' : 'crosshair',
          touchAction: 'none'
        }}
        onMouseDown={startDraw}
        onMouseMove={moveDraw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={moveDraw}
        onTouchEnd={endDraw}
      />

      {/* AI 결과 레이블 */}
      {aiLines.length > 0 && (
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          <div className="flex items-center gap-1 bg-white bg-opacity-90 rounded-md px-2 py-1 text-xs shadow-sm">
            <div className="w-4 h-0.5 bg-blue-600" />
            <span className="text-gray-700">학생 드로잉</span>
          </div>
          <div className="flex items-center gap-1 bg-white bg-opacity-90 rounded-md px-2 py-1 text-xs shadow-sm">
            <div className="w-4 h-0.5 bg-red-500" />
            <span className="text-gray-700">AI 정답</span>
          </div>
        </div>
      )}

    </div>
  )
}
