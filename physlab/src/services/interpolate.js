/**
 * IDW (Inverse Distance Weighting) 보간
 *
 * 측정된 희소 데이터 포인트들로부터 고밀도 격자를 생성합니다.
 *
 * @param {Array<{x: number, y: number, V: number}>} measurements
 *   측정값 배열 (x, y: 0~7 격자 좌표, V: 전위값)
 * @param {number} resolution
 *   보간 격자 해상도 (기본 50 → 50×50 격자)
 * @param {number} power
 *   IDW 거리 가중치 지수 (기본 2, 클수록 가까운 점에 집중)
 * @returns {number[][]}
 *   2D 배열 [row][col], 크기 resolution × resolution
 *   좌표 변환: col → x, row → y
 */
export function idwInterpolate(measurements, resolution = 50, power = 2) {
  if (!measurements || measurements.length === 0) {
    return Array.from({ length: resolution }, () => new Array(resolution).fill(0))
  }

  const grid = Array.from({ length: resolution }, () => new Array(resolution).fill(0))
  const step = 7 / (resolution - 1)  // 격자 0~7 범위를 resolution 개로 나눔

  for (let row = 0; row < resolution; row++) {
    for (let col = 0; col < resolution; col++) {
      const gx = col * step  // 격자 x 좌표 (0~7)
      const gy = row * step  // 격자 y 좌표 (0~7)

      let weightedSum = 0
      let weightTotal = 0
      let exactMatch = null

      for (const m of measurements) {
        const dx = gx - m.x
        const dy = gy - m.y
        const dist2 = dx * dx + dy * dy

        if (dist2 < 1e-10) {
          // 정확히 측정 포인트 위
          exactMatch = m.V
          break
        }

        const weight = 1 / Math.pow(dist2, power / 2)
        weightedSum += weight * m.V
        weightTotal += weight
      }

      if (exactMatch !== null) {
        grid[row][col] = exactMatch
      } else if (weightTotal > 0) {
        grid[row][col] = weightedSum / weightTotal
      }
    }
  }

  return grid
}

/**
 * 격자의 gradient 계산 (중앙 차분법)
 *
 * @param {number[][]} grid - 2D 전위 격자
 * @param {number} resolution
 * @returns {{ gx: number[][], gy: number[][] }}
 *   gx: x 방향 gradient, gy: y 방향 gradient
 */
export function computeGradient(grid, resolution) {
  const gx = Array.from({ length: resolution }, () => new Array(resolution).fill(0))
  const gy = Array.from({ length: resolution }, () => new Array(resolution).fill(0))
  const step = 7 / (resolution - 1)

  for (let row = 0; row < resolution; row++) {
    for (let col = 0; col < resolution; col++) {
      // x 방향 (col)
      if (col === 0) {
        gx[row][col] = (grid[row][col + 1] - grid[row][col]) / step
      } else if (col === resolution - 1) {
        gx[row][col] = (grid[row][col] - grid[row][col - 1]) / step
      } else {
        gx[row][col] = (grid[row][col + 1] - grid[row][col - 1]) / (2 * step)
      }

      // y 방향 (row)
      if (row === 0) {
        gy[row][col] = (grid[row + 1][col] - grid[row][col]) / step
      } else if (row === resolution - 1) {
        gy[row][col] = (grid[row][col] - grid[row - 1][col]) / step
      } else {
        gy[row][col] = (grid[row + 1][col] - grid[row - 1][col]) / (2 * step)
      }
    }
  }

  return { gx, gy }
}

/**
 * 격자 좌표(0~7)를 해상도 인덱스로 변환
 * @param {number} coord - 0~7
 * @param {number} resolution
 * @returns {number}
 */
export function coordToIndex(coord, resolution) {
  return Math.round(coord * (resolution - 1) / 7)
}

/**
 * 해상도 인덱스를 격자 좌표(0~7)로 변환
 * @param {number} idx
 * @param {number} resolution
 * @returns {number}
 */
export function indexToCoord(idx, resolution) {
  return idx * 7 / (resolution - 1)
}
