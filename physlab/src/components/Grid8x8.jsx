import React from 'react'

/**
 * 8×8 격자 컴포넌트 — SVG 교점 기반
 * 전극 위치를 격자 외부에 좌표 기반으로 정확히 표시합니다.
 */
export default function Grid8x8({ measurements = [], onCellClick, selectedCell = null, electrodeConfig = null }) {
  const SPACING  = 56        // 교점 간격 (px)
  const PAD      = 60        // 격자 외부 여백 (전극 표시 공간)
  const POINTS   = 8         // 0~7
  const DOT_R    = 13        // 교점 원 반지름

  const W = PAD + (POINTS - 1) * SPACING + PAD
  const H = PAD + (POINTS - 1) * SPACING + PAD

  // 격자 좌표(소수 포함) → SVG 픽셀
  const px = (col) => PAD + col * SPACING
  const py = (row) => PAD + row * SPACING

  // 측정값 맵
  const measureMap = new Map()
  for (const m of measurements) measureMap.set(`${m.x},${m.y}`, m.V)

  // COM 참조점
  const comCoord = electrodeConfig?.negative
    ? {
        x: Math.min(7, Math.max(0, Math.round(electrodeConfig.negative.x))),
        y: Math.min(7, Math.max(0, Math.round(electrodeConfig.negative.y))),
      }
    : null

  const isComCell      = (col, row) => comCoord && col === comCoord.x && row === comCoord.y
  const isLineElectrode = electrodeConfig?.type === 'line_electrode'

  // ── 전극 마커 렌더링 ──────────────────────────────────────────
  function ElectrodeMarkers() {
    if (!electrodeConfig) return null

    if (isLineElectrode) {
      // 선전극: 격자 상단/하단에 굵은 수평 바
      const x1 = px(0) - 10
      const x2 = px(POINTS - 1) + 10
      const yPos = px(electrodeConfig.positive.y)   // y < 0 이므로 PAD 위
      const yNeg = py(electrodeConfig.negative.y)   // y > 7 이므로 PAD 아래

      return (
        <g>
          {/* 양극 바 */}
          <rect x={x1} y={yPos - 8} width={x2 - x1} height={14} rx={5}
            fill="#ef4444" opacity={0.9} />
          <text x={(x1 + x2) / 2} y={yPos + 2} textAnchor="middle"
            fill="white" fontSize={13} fontWeight="bold">＋ 양극 전극</text>

          {/* 음극 바 */}
          <rect x={x1} y={yNeg - 6} width={x2 - x1} height={14} rx={5}
            fill="#6366f1" opacity={0.9} />
          <text x={(x1 + x2) / 2} y={yNeg + 5} textAnchor="middle"
            fill="white" fontSize={13} fontWeight="bold">⊖ 음극 전극</text>
        </g>
      )
    }

    // 점전극: 실제 좌표를 픽셀로 변환
    const { positive: pos, negative: neg } = electrodeConfig
    const posX = px(pos.x), posY = py(pos.y)
    const negX = px(neg.x), negY = py(neg.y)

    // 양극 → 격자 안쪽 방향으로 선 연결
    const gridCenterX = px(3.5), gridCenterY = py(3.5)
    const makeLine = (ex, ey, gx, gy) => {
      const dx = gx - ex, dy = gy - ey
      const len = Math.sqrt(dx * dx + dy * dy)
      return { x2: ex + (dx / len) * (DOT_R + 28), y2: ey + (dy / len) * (DOT_R + 28) }
    }
    const posLine = makeLine(posX, posY, gridCenterX, gridCenterY)
    const negLine = makeLine(negX, negY, gridCenterX, gridCenterY)

    return (
      <g>
        {/* 양극 → 격자 연결선 */}
        <line x1={posX} y1={posY} x2={posLine.x2} y2={posLine.y2}
          stroke="#ef4444" strokeWidth={2} strokeDasharray="4 3" opacity={0.6} />
        {/* 음극 → 격자 연결선 */}
        <line x1={negX} y1={negY} x2={negLine.x2} y2={negLine.y2}
          stroke="#6366f1" strokeWidth={2} strokeDasharray="4 3" opacity={0.6} />

        {/* 양극 핀 */}
        <circle cx={posX} cy={posY} r={18} fill="#ef4444" opacity={0.95} />
        <text x={posX} y={posY - 3} textAnchor="middle" fill="white" fontSize={15} fontWeight="bold">＋</text>
        <text x={posX} y={posY + 10} textAnchor="middle" fill="#fecaca" fontSize={9}>양극</text>

        {/* 음극 핀 */}
        <circle cx={negX} cy={negY} r={18} fill="#6366f1" opacity={0.95} />
        <text x={negX} y={negY - 3} textAnchor="middle" fill="white" fontSize={15} fontWeight="bold">−</text>
        <text x={negX} y={negY + 10} textAnchor="middle" fill="#c7d2fe" fontSize={9}>음극</text>
      </g>
    )
  }

  return (
    <div className="select-none overflow-x-auto">
      <svg
        width={W}
        height={H}
        style={{ touchAction: 'none', display: 'block', minWidth: W }}
      >
        {/* 격자선 */}
        {Array.from({ length: POINTS }, (_, i) => (
          <g key={`lines-${i}`}>
            <line x1={px(i)} y1={py(0)} x2={px(i)} y2={py(POINTS - 1)}
              stroke="#e5e7eb" strokeWidth={1.5} />
            <line x1={px(0)} y1={py(i)} x2={px(POINTS - 1)} y2={py(i)}
              stroke="#e5e7eb" strokeWidth={1.5} />
          </g>
        ))}

        {/* 전극 마커 */}
        <ElectrodeMarkers />

        {/* 교점 */}
        {Array.from({ length: POINTS }, (_, row) =>
          Array.from({ length: POINTS }, (_, col) => {
            const key      = `${col},${row}`
            const V        = measureMap.get(key)
            const isCom    = isComCell(col, row)
            const isSel    = selectedCell === key
            const hasValue = V !== undefined || isCom

            let fill   = '#ffffff'
            let stroke = '#d1d5db'
            let sw     = 1.5
            if (isCom)      { fill = '#4f46e5'; stroke = '#3730a3'; sw = 2 }
            else if (isSel) { fill = '#fbbf24'; stroke = '#d97706'; sw = 2.5 }
            else if (hasValue) { fill = '#dbeafe'; stroke = '#3b82f6'; sw = 2 }

            const cx = px(col), cy = py(row)

            return (
              <g key={key}>
                {/* 터치 히트 영역 — onTouchEnd + preventDefault로 300ms 지연 및 backdrop 이벤트 차단 */}
                <circle cx={cx} cy={cy} r={DOT_R + 11}
                  fill="transparent"
                  style={{ cursor: isCom ? 'not-allowed' : 'pointer' }}
                  onTouchEnd={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    if (isCom || !onCellClick) return
                    onCellClick(col, row)
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (isCom || !onCellClick) return
                    onCellClick(col, row)
                  }}
                />

                {/* 교점 원 */}
                <circle cx={cx} cy={cy} r={DOT_R} fill={fill} stroke={stroke} strokeWidth={sw} />

                {/* 교점 내부 텍스트 */}
                {isCom ? (
                  <>
                    <text x={cx} y={cy - 2} textAnchor="middle" fill="white"  fontSize={8}  fontWeight="bold">COM</text>
                    <text x={cx} y={cy + 8} textAnchor="middle" fill="#c7d2fe" fontSize={8}>0V</text>
                  </>
                ) : hasValue ? (
                  <text x={cx} y={cy + 5} textAnchor="middle" fill="#1e40af" fontSize={11} fontWeight="bold">
                    {Number(V).toFixed(1)}
                  </text>
                ) : (
                  /* 미입력: 좌표 표시 */
                  <text x={cx} y={cy + 4} textAnchor="middle" fill="#9ca3af" fontSize={10}>
                    {col},{row}
                  </text>
                )}
              </g>
            )
          })
        )}
      </svg>

      {/* ── 범례 ── */}
      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        {comCoord && (
          <span className="flex items-center gap-1 bg-indigo-600 text-white rounded-full px-3 py-1 font-bold">
            COM 고정점 ({comCoord.x},{comCoord.y}) = 0V 기준
          </span>
        )}
        <span className="flex items-center gap-1 bg-blue-50 border border-blue-300 rounded-full px-3 py-1 text-blue-700">
          파란 원 = 입력 완료
        </span>
      </div>

      {/* ── 진행 현황 바 ── */}
      <div className="mt-2">
        <div className="flex justify-between text-sm text-gray-500 mb-1">
          <span>입력 진행</span>
          <span className="font-semibold text-blue-600">{measurements.length} / 64</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div
            className="bg-blue-500 h-2.5 rounded-full transition-all duration-300"
            style={{ width: `${(measurements.length / 64) * 100}%` }}
          />
        </div>
      </div>
    </div>
  )
}
