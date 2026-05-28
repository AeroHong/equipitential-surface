import React, { useMemo, useRef, useEffect } from 'react'
import * as d3 from 'd3'
import { laplaceInterpolate } from '../services/interpolate.js'
import { computeContours, getVoltageRange } from '../utils/equipotential.js'

const RESOLUTION = 71
const GRID_SIZE = 8  // 0~7

/**
 * 등전위선 지도 컴포넌트 (SVG 렌더링)
 *
 * @param {Array<{x,y,V}>} measurements - 측정값 배열
 * @param {object} electrodeConfig - 전극 설정 { positive:{x,y}, negative:{x,y}, type }
 * @param {number} width - SVG 폭 (기본 300)
 * @param {number} height - SVG 높이 (기본 300)
 * @param {number} levels - 등전위선 개수 (기본 10)
 */
export default function EquipotentialMap({
  measurements = [],
  electrodeConfig = null,
  width = 300,
  height = 300,
  levels = 10
}) {
  const svgRef = useRef(null)

  const grid = useMemo(() => {
    if (measurements.length < 3) return null
    return laplaceInterpolate(measurements, RESOLUTION)
  }, [measurements])

  const contourData = useMemo(() => {
    if (!grid) return []
    return computeContours(grid, RESOLUTION, levels)
  }, [grid, levels])

  const { min: minV, max: maxV } = useMemo(() => {
    if (!grid) return { min: 0, max: 1 }
    return getVoltageRange(grid)
  }, [grid])

  useEffect(() => {
    if (!svgRef.current) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    // 배경
    svg.append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', '#f8fafc')
      .attr('rx', 4)

    if (measurements.length < 3) {
      // 데이터 부족 안내
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2 - 10)
        .attr('text-anchor', 'middle')
        .attr('fill', '#94a3b8')
        .attr('font-size', '13')
        .text('측정값 3개 이상 입력 시')

      svg.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2 + 10)
        .attr('text-anchor', 'middle')
        .attr('fill', '#94a3b8')
        .attr('font-size', '13')
        .text('등전위선이 표시됩니다')
      return
    }

    // 등전위선 path generator (resolution → SVG 좌표 변환)
    const scaleX = width / RESOLUTION
    const scaleY = height / RESOLUTION

    const pathGen = d3.geoPath()
      .projection(
        d3.geoIdentity()
          .scale(1)
          .translate([0, 0])
      )

    // 커스텀 path: resolution 좌표를 픽셀로 변환
    const transform = d3.geoIdentity().reflectY(false)
    const pathGenScaled = d3.geoPath().projection({
      stream(s) {
        return {
          point(x, y) { s.point(x * scaleX, y * scaleY) },
          lineStart() { s.lineStart() },
          lineEnd() { s.lineEnd() },
          polygonStart() { s.polygonStart() },
          polygonEnd() { s.polygonEnd() },
          sphere() { s.sphere() }
        }
      }
    })

    // 등전위선 렌더링
    const colorScale = d3.scaleSequential(d3.interpolateViridis)
      .domain([minV, maxV])

    svg.append('g')
      .attr('class', 'contours')
      .selectAll('path')
      .data(contourData)
      .join('path')
      .attr('d', pathGenScaled)
      .attr('fill', d => colorScale(d.value))
      .attr('fill-opacity', 0.15)
      .attr('stroke', d => colorScale(d.value))
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.8)

    // 격자 경계선
    svg.append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'none')
      .attr('stroke', '#cbd5e1')
      .attr('stroke-width', 1)

    // 측정 포인트 표시
    const ptScale = width / GRID_SIZE
    svg.append('g')
      .attr('class', 'measurements')
      .selectAll('circle')
      .data(measurements)
      .join('circle')
      .attr('cx', d => d.x * ptScale + ptScale / 2)
      .attr('cy', d => d.y * ptScale + ptScale / 2)
      .attr('r', 3)
      .attr('fill', '#3b82f6')
      .attr('fill-opacity', 0.7)

    // 전극 위치 표시
    if (electrodeConfig) {
      const { positive, negative, type } = electrodeConfig

      function drawElectrode(ex, ey, isPositive) {
        const px = ex * ptScale + ptScale / 2
        const py = ey * ptScale + ptScale / 2
        const color = isPositive ? '#ef4444' : '#6366f1'
        const symbol = isPositive ? '+' : '−'

        // 전극 위치가 격자 내에 있는 경우만 표시
        // 격자 외부는 클램프해서 경계에 표시
        const clampedX = Math.max(ptScale * 0.3, Math.min(width - ptScale * 0.3, px))
        const clampedY = Math.max(ptScale * 0.3, Math.min(height - ptScale * 0.3, py))

        svg.append('circle')
          .attr('cx', clampedX)
          .attr('cy', clampedY)
          .attr('r', 8)
          .attr('fill', color)
          .attr('fill-opacity', 0.9)
          .attr('stroke', 'white')
          .attr('stroke-width', 1.5)

        svg.append('text')
          .attr('x', clampedX)
          .attr('y', clampedY + 5)
          .attr('text-anchor', 'middle')
          .attr('fill', 'white')
          .attr('font-size', '11')
          .attr('font-weight', 'bold')
          .text(symbol)
      }

      if (type === 'line_electrode') {
        // 선전극: 상단/하단에 수평선 표시
        svg.append('line')
          .attr('x1', 10).attr('y1', 6)
          .attr('x2', width - 10).attr('y2', 6)
          .attr('stroke', '#ef4444').attr('stroke-width', 4)
          .attr('stroke-linecap', 'round')
        svg.append('text')
          .attr('x', width - 8).attr('y', 10)
          .attr('text-anchor', 'end')
          .attr('fill', '#ef4444').attr('font-size', '10').attr('font-weight', 'bold')
          .text('+')

        svg.append('line')
          .attr('x1', 10).attr('y1', height - 6)
          .attr('x2', width - 10).attr('y2', height - 6)
          .attr('stroke', '#6366f1').attr('stroke-width', 4)
          .attr('stroke-linecap', 'round')
        svg.append('text')
          .attr('x', width - 8).attr('y', height - 2)
          .attr('text-anchor', 'end')
          .attr('fill', '#6366f1').attr('font-size', '10').attr('font-weight', 'bold')
          .text('−')
      } else {
        // 점전극
        if (positive) drawElectrode(positive.x, positive.y, true)
        if (negative) drawElectrode(negative.x, negative.y, false)
      }
    }

    // 컬러 범례
    const legendW = 80
    const legendH = 10
    const legendX = width - legendW - 4
    const legendY = height - legendH - 4

    const defs = svg.append('defs')
    const grad = defs.append('linearGradient')
      .attr('id', 'legend-grad')
      .attr('x1', '0%').attr('x2', '100%')

    grad.append('stop').attr('offset', '0%').attr('stop-color', d3.interpolateViridis(0))
    grad.append('stop').attr('offset', '100%').attr('stop-color', d3.interpolateViridis(1))

    svg.append('rect')
      .attr('x', legendX).attr('y', legendY)
      .attr('width', legendW).attr('height', legendH)
      .attr('fill', 'url(#legend-grad)')
      .attr('rx', 2)

    svg.append('text')
      .attr('x', legendX).attr('y', legendY - 2)
      .attr('fill', '#64748b').attr('font-size', '8')
      .text(`${minV.toFixed(1)}V`)

    svg.append('text')
      .attr('x', legendX + legendW).attr('y', legendY - 2)
      .attr('text-anchor', 'end')
      .attr('fill', '#64748b').attr('font-size', '8')
      .text(`${maxV.toFixed(1)}V`)

  }, [measurements, contourData, minV, maxV, electrodeConfig, width, height])

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="rounded-lg border border-gray-200 shadow-sm"
        style={{ background: '#f8fafc' }}
      />
      {measurements.length > 0 && measurements.length < 3 && (
        <div className="absolute top-1 left-1 text-xs text-gray-400 bg-white bg-opacity-80 rounded px-1">
          {measurements.length}개 입력됨
        </div>
      )}
    </div>
  )
}
