import { laplaceInterpolate } from '../services/interpolate.js'

const RESOLUTION_AUTO = 71  // 7/(71-1) = 0.1 unit/cell 해상도

// ── 점유 격자 (Occupancy Grid) ────────────────────────────────
const OCC_RES    = 70
const OCC_CELL   = 7 / OCC_RES
const D_SEP      = 0.38
const OCC_RCELLS = Math.ceil(D_SEP / OCC_CELL)

function makeOcc() {
  return new Uint8Array(OCC_RES * OCC_RES)
}

function markOcc(occ, x, y) {
  const ci = Math.round(x / OCC_CELL)
  const ri = Math.round(y / OCC_CELL)
  for (let dr = -OCC_RCELLS; dr <= OCC_RCELLS; dr++) {
    for (let dc = -OCC_RCELLS; dc <= OCC_RCELLS; dc++) {
      if ((dr * OCC_CELL) ** 2 + (dc * OCC_CELL) ** 2 > D_SEP * D_SEP) continue
      const r = ri + dr, c = ci + dc
      if (r >= 0 && r < OCC_RES && c >= 0 && c < OCC_RES) occ[r * OCC_RES + c] = 1
    }
  }
}

function checkOcc(occ, x, y) {
  const ci = Math.round(x / OCC_CELL)
  const ri = Math.round(y / OCC_CELL)
  if (ci < 0 || ci >= OCC_RES || ri < 0 || ri >= OCC_RES) return false
  return occ[ri * OCC_RES + ci] === 1
}

// ── 시작점 계산 ───────────────────────────────────────────────

function rayGridEntry(ex, ey, angle) {
  const dx = Math.cos(angle), dy = Math.sin(angle)
  const ts = []
  const tryT = (t) => {
    if (t <= 1e-9) return
    const x = ex + t * dx, y = ey + t * dy
    if (x >= -0.001 && x <= 7.001 && y >= -0.001 && y <= 7.001) ts.push(t)
  }
  if (Math.abs(dx) > 1e-9) { tryT((0 - ex) / dx); tryT((7 - ex) / dx) }
  if (Math.abs(dy) > 1e-9) { tryT((0 - ey) / dy); tryT((7 - ey) / dy) }
  if (ts.length === 0) return null
  const t = Math.min(...ts) + 0.08
  return {
    x: Math.max(0.05, Math.min(6.95, ex + t * dx)),
    y: Math.max(0.05, Math.min(6.95, ey + t * dy)),
  }
}

function viewAngleRange(ex, ey) {
  let angles = [[0,0],[7,0],[0,7],[7,7]].map(([cx,cy]) => Math.atan2(cy - ey, cx - ex))
  if (Math.max(...angles) - Math.min(...angles) > Math.PI) {
    angles = angles.map(a => a < 0 ? a + 2 * Math.PI : a)
  }
  return { min: Math.min(...angles), max: Math.max(...angles) }
}

// ── 메인: 전기력선 계산 (등전위 호핑) ──────────────────────────
//
// 핵심 아이디어:
//   현재 점에서 V = V_curr - ΔV 인 등전위면까지의 "가장 가까운 점"을 이어나감
//   → 가장 가까운 교차점 = 전위의 음의 기울기 방향 = 전기장 방향
//   그라디언트를 직접 계산하지 않고 전위값 자체로 전기력선 추적
//
// 알고리즘:
//   72방향(5°)으로 ray를 쏴서, 각 방향에서 V가 v_target을 처음 통과하는 거리를 선형보간
//   → 교차 거리가 최소인 방향 = 전기장 방향 → 해당 점으로 이동

export function computeFieldLines(grid, resolution, electrodeConfig, numLines = 8) {
  if (!grid || grid.length === 0) return []

  const gridStep = 7 / (resolution - 1)

  // 전위 범위 계산
  let vmin = Infinity, vmax = -Infinity
  for (let i = 0; i < resolution; i++)
    for (let j = 0; j < resolution; j++) {
      if (grid[i][j] < vmin) vmin = grid[i][j]
      if (grid[i][j] > vmax) vmax = grid[i][j]
    }
  const vrange = vmax - vmin
  if (vrange < 1e-6) return []

  // 스텝당 전위 강하 (전체 범위의 1/120)
  const DELTA_V = vrange / 120

  // 쌍선형 보간으로 임의 좌표의 전위값 계산 (경계 클램핑 포함)
  function interpV(x, y) {
    if (x < 0 || x > 7 || y < 0 || y > 7) return null
    const fj = Math.min(x / gridStep, resolution - 1.001)
    const fi = Math.min(y / gridStep, resolution - 1.001)
    const j0 = Math.floor(fj), i0 = Math.floor(fi)
    if (i0 < 0 || j0 < 0) return null
    const di = fi - i0, dj = fj - j0
    return (1-di)*(1-dj)*grid[i0][j0]   + (1-di)*dj*grid[i0][j0+1]
         +    di*(1-dj)*grid[i0+1][j0]  +    di*dj*grid[i0+1][j0+1]
  }

  const { positive: pos, negative: neg, type } = electrodeConfig

  // 시작점 생성
  const N1 = Math.max(1, numLines - 1)
  const startPoints = []

  if (type === 'line_electrode') {
    if      (pos.y < 0) for (let i = 0; i < numLines; i++) startPoints.push({ x: 0.5 + 6*i/N1, y: 0.05 })
    else if (pos.y > 7) for (let i = 0; i < numLines; i++) startPoints.push({ x: 0.5 + 6*i/N1, y: 6.95 })
    else if (pos.x < 0) for (let i = 0; i < numLines; i++) startPoints.push({ x: 0.05, y: 0.5 + 6*i/N1 })
    else                for (let i = 0; i < numLines; i++) startPoints.push({ x: 6.95, y: 0.5 + 6*i/N1 })
  } else {
    const { min: minA, max: maxA } = viewAngleRange(pos.x, pos.y)
    const span = maxA - minA
    for (let i = 0; i < numLines; i++) {
      const seed = rayGridEntry(pos.x, pos.y, minA + span * (i + 0.5) / numLines)
      if (seed) startPoints.push(seed)
    }
  }

  const negInside = neg.x >= 0 && neg.x <= 7 && neg.y >= 0 && neg.y <= 7
  const negX = Math.max(0, Math.min(7, neg.x))
  const negY = Math.max(0, Math.min(7, neg.y))

  // 호핑 파라미터
  const N_ANGLES  = 72                  // 방향 샘플 수 (5° 간격)
  const H_MARCH   = gridStep * 0.5     // ray 탐색 스텝 (0.05 grid unit)
  const SEARCH_R  = gridStep * 25      // 최대 탐색 반경 (2.5 grid unit)
  const maxIter   = 600
  const GRACE     = 20                 // 시작 근처 마킹 제외 스텝 수

  const occ = makeOcc()
  const fieldLines = []

  for (const start of startPoints) {
    if (start.x < 0 || start.x > 7 || start.y < 0 || start.y > 7) continue

    const v0 = interpV(start.x, start.y)
    if (v0 === null) continue

    const points = [{ x: start.x, y: start.y }]
    let cx = start.x, cy = start.y, v_curr = v0
    let prevDx = 0, prevDy = 0

    for (let iter = 0; iter < maxIter; iter++) {
      const v_target = v_curr - DELTA_V

      let bestX = null, bestY = null, bestDist = Infinity

      // 72방향으로 ray를 쏴서 v_target 교차점 탐색
      for (let ai = 0; ai < N_ANGLES; ai++) {
        const angle = (ai / N_ANGLES) * 2 * Math.PI
        const cosA  = Math.cos(angle)
        const sinA  = Math.sin(angle)

        // 이전 방향에서 110° 초과 방향은 제외 (후진 방지)
        if ((prevDx !== 0 || prevDy !== 0) && cosA * prevDx + sinA * prevDy < -0.34) continue

        // ray를 따라 전진하며 v_target 통과 지점 탐색
        let t = H_MARCH, vPrev = v_curr
        while (t <= SEARCH_R) {
          const nx = cx + t * cosA, ny = cy + t * sinA
          const v = interpV(nx, ny)
          if (v === null) break  // 격자 경계 밖

          if (v <= v_target) {
            // vPrev → v 사이에서 v_target 선형보간
            const frac = (vPrev - v_target) / (vPrev - v)
            const tCross = (t - H_MARCH) + frac * H_MARCH
            if (tCross < bestDist) {
              bestDist = tCross
              bestX = cx + tCross * cosA
              bestY = cy + tCross * sinA
            }
            break
          }

          vPrev = v
          t += H_MARCH
        }
      }

      if (bestX === null) break  // 어느 방향에서도 교차점 없음 → 종료

      if (bestX < 0 || bestX > 7 || bestY < 0 || bestY > 7) break
      if (negInside && (bestX - negX)**2 + (bestY - negY)**2 < 0.16) break
      if (checkOcc(occ, bestX, bestY)) break

      const ddx = bestX - cx, ddy = bestY - cy
      const dlen = Math.hypot(ddx, ddy)
      if (dlen > 0) { prevDx = ddx / dlen; prevDy = ddy / dlen }

      cx = bestX; cy = bestY
      v_curr = interpV(cx, cy) ?? v_target
      points.push({ x: cx, y: cy })
    }

    if (points.length < 5) continue
    fieldLines.push({ points })

    for (let i = GRACE; i < points.length; i++) {
      markOcc(occ, points[i].x, points[i].y)
    }
  }

  return fieldLines
}

// ── 자동 전기력선 생성 (Step1 → Firestore 저장용) ─────────────

export function autoGenerateFieldLines(measurements, electrodeConfig, numLines = 12) {
  if (!measurements || measurements.length < 3 || !electrodeConfig) return []
  const grid = laplaceInterpolate(measurements, RESOLUTION_AUTO)
  const serialized = computeFieldLines(grid, RESOLUTION_AUTO, electrodeConfig, numLines)
  return serialized
    .filter(l => l.points && l.points.length >= 5)
    .map(l => l.points)
}

export function detectLineFormat(lines) {
  if (!lines || lines.length === 0) return 'grid'
  const all = lines.flatMap(l => l.flatMap(p => [p.x, p.y])).filter(isFinite)
  if (all.length === 0) return 'grid'
  return Math.max(...all) > 8 ? 'pixel' : 'grid'
}

export function computePerpendicularScore(drawnLines, contourPaths, canvasWidth, canvasHeight) {
  if (!drawnLines || drawnLines.length === 0) return 0
  if (!contourPaths || contourPaths.length === 0) return 50
  let totalDiff = 0, count = 0
  for (const line of drawnLines) {
    for (let i = 0; i < line.length - 1; i++) {
      const p1 = line[i], p2 = line[i+1]
      const len = Math.hypot(p2.x-p1.x, p2.y-p1.y)
      if (len < 1) continue
      const la = Math.atan2(p2.y-p1.y, p2.x-p1.x)
      const mx = (p1.x+p2.x)/2, my = (p1.y+p2.y)/2
      let best = null
      for (const c of contourPaths) {
        if (!c.coordinates) continue
        for (const ring of c.coordinates) {
          for (const poly of (Array.isArray(ring[0][0]) ? ring : [ring])) {
            for (let j = 0; j < poly.length - 1; j++) {
              const cx1=poly[j][0]*canvasWidth/50,   cy1=poly[j][1]*canvasHeight/50
              const cx2=poly[j+1][0]*canvasWidth/50, cy2=poly[j+1][1]*canvasHeight/50
              if (ptSegDist(mx,my,cx1,cy1,cx2,cy2) > 30) continue
              let d = Math.abs(la - Math.atan2(cy2-cy1,cx2-cx1)) * 180 / Math.PI % 180
              if (d > 90) d = 180 - d
              const d90 = Math.abs(90 - d)
              if (best === null || d90 < best) best = d90
            }
          }
        }
      }
      if (best !== null) { totalDiff += best; count++ }
    }
  }
  if (count === 0) return 50
  return Math.max(0, Math.min(100, Math.round(100 * (1 - totalDiff/count/90))))
}

function ptSegDist(px,py,x1,y1,x2,y2) {
  const dx=x2-x1, dy=y2-y1, l2=dx*dx+dy*dy
  if (l2===0) return Math.hypot(px-x1, py-y1)
  const t = Math.max(0, Math.min(1, ((px-x1)*dx+(py-y1)*dy)/l2))
  return Math.hypot(px-(x1+t*dx), py-(y1+t*dy))
}
