import React, { useRef, useEffect, useCallback } from 'react'
import * as d3 from 'd3'
import { laplaceInterpolate } from '../services/interpolate.js'
import { computeContours, getVoltageRange } from '../utils/equipotential.js'
import { detectLineFormat } from '../utils/fieldLine.js'

const RESOLUTION = 71  // 0.1 unit/cell 해상도

/**
 * 전기력선 드로잉 캔버스
 *
 * @param {Array<{x,y,V}>} measurements
 * @param {Array} drawnLines
 * @param {function} onDraw - 드로잉 콜백 (lines 배열)
 * @param {number} width
 * @param {number} height
 * @param {object} electrodeConfig
 * @param {boolean} readOnly
 */
export default function FieldLineCanvas({
  measurements = [],
  drawnLines = [],
  onDraw,
  width = 350,
  height = 350,
  electrodeConfig = null,
  readOnly = false
}) {
  const bgCanvasRef   = useRef(null)
  const drawCanvasRef = useRef(null)
  const isDrawing     = useRef(false)
  const currentLine   = useRef([])
  const allLines      = useRef([...drawnLines])

  // ── 배경(등전위선) 렌더링 ─────────────────────────────────────
  useEffect(() => {
    const canvas = bgCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, width, height)

    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(0, 0, width, height)

    if (measurements.length < 3) {
      ctx.fillStyle = '#94a3b8'
      ctx.font = '13px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('등전위선을 먼저 생성하세요', width / 2, height / 2)
      return
    }

    const grid = laplaceInterpolate(measurements, RESOLUTION)
    const contourData = computeContours(grid, RESOLUTION, 20)   // 20개 촘촘히
    const { min: minV, max: maxV } = getVoltageRange(grid)

    const scaleX = width / RESOLUTION
    const scaleY = height / RESOLUTION

    for (const contour of contourData) {
      const t = maxV === minV ? 0.5 : (contour.value - minV) / (maxV - minV)
      const color = d3.interpolateViridis(t)
      ctx.strokeStyle = color
      ctx.lineWidth = 1.5
      ctx.globalAlpha = 0.85

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
        const px = Math.max(10, Math.min(width  - 10, ex * ptScale + ptScale / 2))
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

    ctx.strokeStyle = '#cbd5e1'
    ctx.lineWidth = 1
    ctx.strokeRect(0, 0, width, height)
  }, [measurements, electrodeConfig, width, height])

  // ── 드로잉 레이어 렌더링 ─────────────────────────────────────
  const redrawLines = useCallback(() => {
    const canvas = drawCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, width, height)

    const fmt   = detectLineFormat(allLines.current)
    const scale = fmt === 'grid' ? width / 7 : 1
    const arrowSize = Math.max(8, width / 28)

    // 화살표 그리기 헬퍼 (채워진 삼각형)
    function drawArrow(pts, frac) {
      const idx = Math.floor(pts.length * frac)
      if (idx < 1 || idx >= pts.length) return
      const p1 = pts[idx - 1], p2 = pts[idx]
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x)
      const tip = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
      const A = Math.PI / 6  // 화살표 반각 30°
      ctx.beginPath()
      ctx.moveTo(tip.x, tip.y)
      ctx.lineTo(tip.x - arrowSize * Math.cos(angle - A), tip.y - arrowSize * Math.sin(angle - A))
      ctx.lineTo(tip.x - arrowSize * Math.cos(angle + A), tip.y - arrowSize * Math.sin(angle + A))
      ctx.closePath()
      ctx.fillStyle = '#1d4ed8'
      ctx.fill()
    }

    ctx.strokeStyle = '#1d4ed8'
    ctx.lineWidth   = 2
    ctx.lineCap     = 'round'
    ctx.lineJoin    = 'round'

    for (const line of allLines.current) {
      if (line.length < 2) continue

      const pts = line.map(p => ({ x: p.x * scale, y: p.y * scale }))

      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
      ctx.stroke()

      // 선 길이가 충분하면 33%, 67% 두 지점에 화살표
      if (pts.length >= 6) {
        drawArrow(pts, 0.33)
        drawArrow(pts, 0.67)
      } else if (pts.length >= 3) {
        drawArrow(pts, 0.55)
      }
    }
  }, [width, height])

  useEffect(() => {
    allLines.current = [...drawnLines]
    redrawLines()
  }, [drawnLines, redrawLines])

  // ── 이벤트 ──────────────────────────────────────────────────
  function getPos(e, canvas) {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if (e.touches) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top)  * scaleY
      }
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top)  * scaleY
    }
  }

  function startDraw(e) {
    if (readOnly) return
    e.preventDefault()
    isDrawing.current = true
    const pos = getPos(e, drawCanvasRef.current)
    currentLine.current = [pos]
  }

  function moveDraw(e) {
    if (!isDrawing.current || readOnly) return
    e.preventDefault()
    const pos = getPos(e, drawCanvasRef.current)
    currentLine.current.push(pos)

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
      // 현재 그리는 선은 항상 픽셀 좌표 (사용자 입력)
      ctx.moveTo(line[0].x, line[0].y)
      for (let i = 1; i < line.length; i++) {
        ctx.lineTo(line[i].x, line[i].y)
      }
      ctx.stroke()
    }
  }

  function endDraw(e) {
    if (!isDrawing.current || readOnly) return
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
      <canvas
        ref={bgCanvasRef}
        width={width}
        height={height}
        className="absolute top-0 left-0 rounded-lg"
        style={{ pointerEvents: 'none' }}
      />
      <canvas
        ref={drawCanvasRef}
        width={width}
        height={height}
        className="absolute top-0 left-0 rounded-lg no-scroll-touch"
        style={{
          cursor: readOnly ? 'default' : 'crosshair',
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
    </div>
  )
}
