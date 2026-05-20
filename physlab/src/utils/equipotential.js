import * as d3 from 'd3'
// d3-contour는 d3에 포함되어 있으며, 별도 패키지도 설치됩니다.
const { contours } = d3

/**
 * 보간된 2D 격자에서 등전위선 contour 데이터 계산
 *
 * @param {number[][]} grid - 보간된 2D 전위 격자 (resolution × resolution)
 * @param {number} resolution - 격자 해상도
 * @param {number} levels - 등전위선 개수 (기본 10)
 * @returns {Array} D3 contour 경로 배열
 *   각 항목: { type, value, coordinates } (GeoJSON MultiPolygon)
 */
export function computeContours(grid, resolution, levels = 10) {
  if (!grid || grid.length === 0) return []

  // 2D 배열을 1D Float64Array로 변환 (d3-contour 요구사항)
  const flat = new Float64Array(resolution * resolution)
  for (let row = 0; row < resolution; row++) {
    for (let col = 0; col < resolution; col++) {
      flat[row * resolution + col] = grid[row][col]
    }
  }

  // 전위 범위 계산
  let minV = Infinity
  let maxV = -Infinity
  for (let i = 0; i < flat.length; i++) {
    if (flat[i] < minV) minV = flat[i]
    if (flat[i] > maxV) maxV = flat[i]
  }

  if (minV === maxV) {
    // 단일 값이면 등전위선 없음
    return []
  }

  // 등간격 레벨 생성 (경계 제외)
  const thresholds = d3.range(levels + 1).map(
    i => minV + (i + 0.5) * (maxV - minV) / (levels + 1)
  )

  // D3 contour 계산
  const contourGen = contours()
    .size([resolution, resolution])
    .thresholds(thresholds)
    .smooth(true)

  return contourGen(flat)
}

/**
 * 등전위선 색상 계산 (viridis 컬러맵)
 *
 * @param {number} value - 전위값
 * @param {number} minV - 최솟값
 * @param {number} maxV - 최댓값
 * @returns {string} CSS 색상 문자열
 */
export function getContourColor(value, minV, maxV) {
  if (maxV === minV) return '#440154'
  const t = (value - minV) / (maxV - minV)
  return d3.interpolateViridis(t)
}

/**
 * 등전위선 데이터에서 전위 범위 추출
 *
 * @param {number[][]} grid
 * @returns {{ min: number, max: number }}
 */
export function getVoltageRange(grid) {
  let min = Infinity
  let max = -Infinity

  for (const row of grid) {
    for (const v of row) {
      if (v < min) min = v
      if (v > max) max = v
    }
  }

  return { min: isFinite(min) ? min : 0, max: isFinite(max) ? max : 0 }
}

/**
 * SVG path 데이터 생성을 위한 d3 geo path generator 생성
 *
 * @param {number} resolution - 격자 해상도
 * @param {number} width - SVG 폭 (픽셀)
 * @param {number} height - SVG 높이 (픽셀)
 * @returns {function} path generator
 */
export function createPathGenerator(resolution, width, height) {
  const projection = d3.geoIdentity()
    .scale(width / resolution)
    .translate([0, 0])

  return d3.geoPath(projection)
}
