/**
 * IDW (Inverse Distance Weighting) 보간 — 초기값 생성용
 */
export function idwInterpolate(measurements, resolution = 71, power = 2) {
  if (!measurements || measurements.length === 0) {
    return Array.from({ length: resolution }, () => new Array(resolution).fill(0))
  }

  const grid = Array.from({ length: resolution }, () => new Array(resolution).fill(0))
  const step = 7 / (resolution - 1)

  for (let row = 0; row < resolution; row++) {
    for (let col = 0; col < resolution; col++) {
      const gx = col * step
      const gy = row * step

      let weightedSum = 0, weightTotal = 0, exactMatch = null

      for (const m of measurements) {
        const dx = gx - m.x, dy = gy - m.y
        const dist2 = dx * dx + dy * dy
        if (dist2 < 1e-10) { exactMatch = m.V; break }
        const weight = 1 / Math.pow(dist2, power / 2)
        weightedSum += weight * m.V
        weightTotal += weight
      }

      grid[row][col] = exactMatch !== null
        ? exactMatch
        : (weightTotal > 0 ? weightedSum / weightTotal : 0)
    }
  }

  return grid
}

/**
 * 라플라스 보간 — 물리적으로 올바른 전위 보간
 *
 * 전기 전위는 전하 없는 공간에서 ∇²V = 0 을 만족합니다.
 * → 각 점의 전위 = 주변 4점의 평균
 *
 * 알고리즘 (SOR: Successive Over-Relaxation):
 *   1. IDW로 전체 격자 초기화
 *   2. 측정점에 해당하는 셀을 정확한 측정값으로 고정
 *   3. 나머지 셀은 4방향 이웃 평균으로 반복 갱신 (수렴까지)
 *
 * 효과:
 *   - 선전극: 평행한 직선 등전위선 (이론과 일치)
 *   - 점전극: 부드러운 동심원형 등전위선
 *   - IDW의 울퉁불퉁한 bull's-eye 제거
 *
 * @param {Array<{x, y, V}>} measurements - 격자 좌표(0~7) 측정값
 * @param {number} resolution - 격자 해상도 (기본 71 → 0.1 unit/cell)
 * @param {number} iterations - 반복 횟수 (기본 400)
 * @returns {number[][]} 2D 전위 격자 [row][col]
 */
export function laplaceInterpolate(measurements, resolution = 71, iterations = 400) {
  if (!measurements || measurements.length === 0) {
    return Array.from({ length: resolution }, () => new Array(resolution).fill(0))
  }

  const step = 7 / (resolution - 1)

  // 1. IDW로 초기화 (경계 포함 전 영역에 합리적인 초기값 제공)
  const grid = idwInterpolate(measurements, resolution)

  // 2. 측정점을 격자 셀에 스냅 후 고정 마킹
  const fixed = new Uint8Array(resolution * resolution)
  for (const m of measurements) {
    const col = Math.round(m.x / step)
    const row = Math.round(m.y / step)
    if (row >= 0 && row < resolution && col >= 0 && col < resolution) {
      grid[row][col] = m.V
      fixed[row * resolution + col] = 1
    }
  }

  // 3. SOR 반복 (ω ≈ 1.85: 71×71 격자 최적 근사값)
  //    수렴 속도: SOR은 단순 Gauss-Seidel 대비 ~10배 빠름
  const omega = 1.85

  for (let iter = 0; iter < iterations; iter++) {
    for (let row = 0; row < resolution; row++) {
      for (let col = 0; col < resolution; col++) {
        if (fixed[row * resolution + col]) continue

        // 4방향 이웃 합산 (경계에서는 가용한 이웃만 사용)
        let sum = 0, count = 0
        if (row > 0)              { sum += grid[row - 1][col]; count++ }
        if (row < resolution - 1) { sum += grid[row + 1][col]; count++ }
        if (col > 0)              { sum += grid[row][col - 1]; count++ }
        if (col < resolution - 1) { sum += grid[row][col + 1]; count++ }
        if (count === 0) continue

        // SOR 갱신: 현재값 + ω × (이웃 평균 - 현재값)
        grid[row][col] += omega * (sum / count - grid[row][col])
      }
    }
  }

  return grid
}

/**
 * 격자의 gradient 계산 (중앙 차분법 — np.gradient와 동일)
 */
export function computeGradient(grid, resolution) {
  const gx = Array.from({ length: resolution }, () => new Array(resolution).fill(0))
  const gy = Array.from({ length: resolution }, () => new Array(resolution).fill(0))
  const step = 7 / (resolution - 1)

  for (let row = 0; row < resolution; row++) {
    for (let col = 0; col < resolution; col++) {
      gx[row][col] = col === 0
        ? (grid[row][col + 1] - grid[row][col]) / step
        : col === resolution - 1
          ? (grid[row][col] - grid[row][col - 1]) / step
          : (grid[row][col + 1] - grid[row][col - 1]) / (2 * step)

      gy[row][col] = row === 0
        ? (grid[row + 1][col] - grid[row][col]) / step
        : row === resolution - 1
          ? (grid[row][col] - grid[row - 1][col]) / step
          : (grid[row + 1][col] - grid[row - 1][col]) / (2 * step)
    }
  }

  return { gx, gy }
}

export function coordToIndex(coord, resolution) {
  return Math.round(coord * (resolution - 1) / 7)
}

export function indexToCoord(idx, resolution) {
  return idx * 7 / (resolution - 1)
}
