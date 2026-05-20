import { computeGradient } from '../services/interpolate.js'

/**
 * gradient 기반 streamline 추적으로 전기력선 계산
 * 양극(+)에서 출발하여 음극(-) 방향으로 수렴합니다.
 */
export function computeFieldLines(grid, resolution, electrodeConfig, numLines = 16) {
  if (!grid || grid.length === 0) return []

  const { gx, gy } = computeGradient(grid, resolution)
  const step = 7 / (resolution - 1)

  function getElectricField(xCoord, yCoord) {
    const fi = yCoord / step
    const fj = xCoord / step
    const i0 = Math.floor(fi)
    const j0 = Math.floor(fj)
    const i1 = i0 + 1
    const j1 = j0 + 1
    if (i0 < 0 || j0 < 0 || i1 >= resolution || j1 >= resolution) return null
    const di = fi - i0
    const dj = fj - j0
    const ex = -(gx[i0][j0]*(1-di)*(1-dj) + gx[i0][j1]*(1-di)*dj + gx[i1][j0]*di*(1-dj) + gx[i1][j1]*di*dj)
    const ey = -(gy[i0][j0]*(1-di)*(1-dj) + gy[i0][j1]*(1-di)*dj + gy[i1][j0]*di*(1-dj) + gy[i1][j1]*di*dj)
    const mag = Math.sqrt(ex*ex + ey*ey)
    if (mag < 1e-10) return null
    return { ex: ex/mag, ey: ey/mag }
  }

  const { positive: pos, negative: neg, type } = electrodeConfig
  const startPoints = []

  if (type === 'line_electrode') {
    // 선전극: 상단 경계에서 균등 분포
    for (let i = 0; i < numLines; i++) {
      startPoints.push({ x: 0.3 + (6.4 * i) / (numLines - 1), y: 0.15 })
    }
  } else {
    // 점전극: 양극 위치에서 가장 가까운 격자 엣지에서 시작
    // 양극이 어느 방향 외부인지 판별
    const posX = pos.x
    const posY = pos.y

    // 엣지 시작점 생성: 양극에 가까운 엣지들에서 fan-out
    const edgePoints = []

    // 상단 엣지 (y=0) — 양극이 위쪽 외부일 때
    if (posY < 0) {
      const cx = Math.max(0, Math.min(7, posX))
      for (let i = 0; i < numLines; i++) {
        const t = i / (numLines - 1)
        const x = 0.1 + t * 6.8
        // 양극에 가까운 x를 더 많이 샘플링 (가중치)
        edgePoints.push({ x, y: 0.1, weight: 1 / (Math.abs(x - cx) + 1) })
      }
    }
    // 좌측 엣지 (x=0) — 양극이 왼쪽 외부일 때
    if (posX < 0) {
      const cy = Math.max(0, Math.min(7, posY))
      for (let i = 0; i < numLines; i++) {
        const t = i / (numLines - 1)
        const y = 0.1 + t * 6.8
        edgePoints.push({ x: 0.1, y, weight: 1 / (Math.abs(y - cy) + 1) })
      }
    }
    // 하단 엣지 (y=7) — 양극이 아래 외부일 때
    if (posY > 7) {
      const cx = Math.max(0, Math.min(7, posX))
      for (let i = 0; i < numLines; i++) {
        const t = i / (numLines - 1)
        const x = 0.1 + t * 6.8
        edgePoints.push({ x, y: 6.9, weight: 1 / (Math.abs(x - cx) + 1) })
      }
    }
    // 우측 엣지 (x=7) — 양극이 오른쪽 외부일 때
    if (posX > 7) {
      const cy = Math.max(0, Math.min(7, posY))
      for (let i = 0; i < numLines; i++) {
        const t = i / (numLines - 1)
        const y = 0.1 + t * 6.8
        edgePoints.push({ x: 6.9, y, weight: 1 / (Math.abs(y - cy) + 1) })
      }
    }

    // 양극이 코너 외부 (예: -0.5,-0.5)이면 두 엣지 모두 포함됨
    // weight 기준 상위 numLines개 선택
    if (edgePoints.length > 0) {
      edgePoints.sort((a, b) => b.weight - a.weight)
      const picked = edgePoints.slice(0, numLines)
      startPoints.push(...picked.map(p => ({ x: p.x, y: p.y })))
    }

    // 엣지 판별 실패시 fallback: 격자 내 균등 분포
    if (startPoints.length === 0) {
      for (let i = 0; i < numLines; i++) {
        const angle = (2 * Math.PI * i) / numLines
        startPoints.push({ x: 3.5 + 2.5 * Math.cos(angle), y: 3.5 + 2.5 * Math.sin(angle) })
      }
    }
  }

  const fieldLines = []
  const traceStep = step * 0.8
  const maxIter   = 400
  const minDist   = 0.3

  for (const start of startPoints) {
    if (start.x < 0 || start.x > 7 || start.y < 0 || start.y > 7) continue
    const points = [{ x: start.x, y: start.y }]
    let cx = start.x
    let cy = start.y

    for (let iter = 0; iter < maxIter; iter++) {
      const k1 = getElectricField(cx, cy)
      if (!k1) break
      const k2 = getElectricField(cx + traceStep*k1.ex/2, cy + traceStep*k1.ey/2)
      if (!k2) break
      const k3 = getElectricField(cx + traceStep*k2.ex/2, cy + traceStep*k2.ey/2)
      if (!k3) break
      const k4 = getElectricField(cx + traceStep*k3.ex, cy + traceStep*k3.ey)
      if (!k4) break

      const nx = cx + (traceStep/6) * (k1.ex + 2*k2.ex + 2*k3.ex + k4.ex)
      const ny = cy + (traceStep/6) * (k1.ey + 2*k2.ey + 2*k3.ey + k4.ey)

      if (nx < 0 || nx > 7 || ny < 0 || ny > 7) break

      const dnx = nx - Math.max(0, Math.min(7, neg.x))
      const dny = ny - Math.max(0, Math.min(7, neg.y))
      if (Math.sqrt(dnx*dnx + dny*dny) < minDist) break

      cx = nx
      cy = ny
      points.push({ x: cx, y: cy })
    }

    if (points.length > 5) fieldLines.push({ points })
  }

  return fieldLines
}

/**
 * 학생이 그린 선과 등전위선의 수직도 점수 계산
 */
export function computePerpendicularScore(drawnLines, contourPaths, canvasWidth, canvasHeight) {
  if (!drawnLines || drawnLines.length === 0) return 0
  if (!contourPaths || contourPaths.length === 0) return 50

  let totalAngularDiff = 0
  let sampleCount = 0

  for (const line of drawnLines) {
    if (line.length < 2) continue
    for (let i = 0; i < line.length - 1; i++) {
      const p1 = line[i], p2 = line[i+1]
      const dx = p2.x - p1.x, dy = p2.y - p1.y
      const len = Math.sqrt(dx*dx + dy*dy)
      if (len < 1) continue
      const lineAngle = Math.atan2(dy, dx)
      const midX = (p1.x + p2.x) / 2
      const midY = (p1.y + p2.y) / 2
      let bestAngleDiff = null

      for (const contour of contourPaths) {
        if (!contour.coordinates) continue
        for (const ring of contour.coordinates) {
          for (const polygon of (Array.isArray(ring[0][0]) ? ring : [ring])) {
            for (let j = 0; j < polygon.length - 1; j++) {
              const cp1 = polygon[j], cp2 = polygon[j+1]
              const resolution = 50
              const cx1 = cp1[0] * canvasWidth / resolution
              const cy1 = cp1[1] * canvasHeight / resolution
              const cx2 = cp2[0] * canvasWidth / resolution
              const cy2 = cp2[1] * canvasHeight / resolution
              const dist = pointToSegmentDist(midX, midY, cx1, cy1, cx2, cy2)
              if (dist > 30) continue
              const contourAngle = Math.atan2(cy2-cy1, cx2-cx1)
              let angleDiff = Math.abs(lineAngle - contourAngle) * 180 / Math.PI
              angleDiff = angleDiff % 180
              if (angleDiff > 90) angleDiff = 180 - angleDiff
              const diffFrom90 = Math.abs(90 - angleDiff)
              if (bestAngleDiff === null || diffFrom90 < bestAngleDiff) bestAngleDiff = diffFrom90
            }
          }
        }
      }
      if (bestAngleDiff !== null) { totalAngularDiff += bestAngleDiff; sampleCount++ }
    }
  }

  if (sampleCount === 0) return 50
  const avgDiff = totalAngularDiff / sampleCount
  return Math.max(0, Math.min(100, Math.round(100 * (1 - avgDiff / 90))))
}

function pointToSegmentDist(px, py, x1, y1, x2, y2) {
  const dx = x2-x1, dy = y2-y1
  const lenSq = dx*dx + dy*dy
  if (lenSq === 0) return Math.sqrt((px-x1)**2 + (py-y1)**2)
  const t = Math.max(0, Math.min(1, ((px-x1)*dx + (py-y1)*dy) / lenSq))
  return Math.sqrt((px-(x1+t*dx))**2 + (py-(y1+t*dy))**2)
}
