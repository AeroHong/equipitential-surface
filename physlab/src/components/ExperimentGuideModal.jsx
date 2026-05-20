import React, { useState } from 'react'

// ── 슬라이드 1: 전도지 격자 그리기 ───────────────────────────
function Slide1() {
  // 불규칙한 격자선을 위한 오프셋 (연필로 그린 느낌)
  const jitter = [
    [0, -1, 1, 0, -1, 1, 0, -1],
    [1, 0, -1, 1, 0, -1, 1, 0],
    [-1, 1, 0, -1, 1, 0, -1, 1],
    [0, -1, 1, 0, -1, 1, 0, -1],
    [1, 0, -1, 1, 0, -1, 1, 0],
    [-1, 1, 0, -1, 1, 0, -1, 1],
    [0, -1, 1, 0, -1, 1, 0, -1],
    [1, 0, -1, 1, 0, -1, 1, 0],
  ]

  const cellSize = 28
  const gridOffset = 32
  const gridSize = cellSize * 8

  // 수평선 (약간 불규칙)
  const hLines = Array.from({ length: 9 }, (_, i) => {
    const y = gridOffset + i * cellSize
    const points = Array.from({ length: 9 }, (_, j) => {
      const x = gridOffset + j * cellSize
      const dy = jitter[i % 8][j % 8]
      return `${x},${y + dy}`
    }).join(' ')
    return (
      <polyline
        key={`h${i}`}
        points={points}
        fill="none"
        stroke="#6b7280"
        strokeWidth="0.8"
        strokeLinecap="round"
        opacity="0.7"
      />
    )
  })

  // 수직선 (약간 불규칙)
  const vLines = Array.from({ length: 9 }, (_, i) => {
    const x = gridOffset + i * cellSize
    const points = Array.from({ length: 9 }, (_, j) => {
      const y = gridOffset + j * cellSize
      const dx = jitter[j % 8][i % 8]
      return `${x + dx},${y}`
    }).join(' ')
    return (
      <polyline
        key={`v${i}`}
        points={points}
        fill="none"
        stroke="#6b7280"
        strokeWidth="0.8"
        strokeLinecap="round"
        opacity="0.7"
      />
    )
  })

  // 좌표 숫자
  const xLabels = Array.from({ length: 8 }, (_, i) => (
    <text
      key={`xl${i}`}
      x={gridOffset + i * cellSize + cellSize / 2}
      y={gridOffset - 8}
      textAnchor="middle"
      fontSize="9"
      fill="#9ca3af"
      fontFamily="monospace"
    >
      {i}
    </text>
  ))
  const yLabels = Array.from({ length: 8 }, (_, i) => (
    <text
      key={`yl${i}`}
      x={gridOffset - 10}
      y={gridOffset + i * cellSize + cellSize / 2 + 3}
      textAnchor="middle"
      fontSize="9"
      fill="#9ca3af"
      fontFamily="monospace"
    >
      {i}
    </text>
  ))

  return (
    <div className="flex flex-col items-center gap-4">
      <svg width="320" height="310" viewBox="0 0 320 310">
        {/* 전도지 배경 (연두색 느낌) */}
        <rect x={gridOffset - 4} y={gridOffset - 4} width={gridSize + 8} height={gridSize + 8}
          rx="4" fill="#f0fdf4" stroke="#86efac" strokeWidth="1.5" />

        {/* 전도지 질감 */}
        <rect x={gridOffset - 4} y={gridOffset - 4} width={gridSize + 8} height={gridSize + 8}
          rx="4" fill="url(#gridPattern)" opacity="0.3" />

        {/* 격자선 */}
        {hLines}
        {vLines}

        {/* 좌표 */}
        {xLabels}
        {yLabels}

        {/* 자(ruler) — 오른쪽 */}
        <g transform="translate(270, 40)">
          <rect x="0" y="0" width="30" height="220" rx="3" fill="#f5f0e0" stroke="#d4a843" strokeWidth="1.5" />
          {/* 눈금 */}
          {Array.from({ length: 22 }, (_, i) => (
            <line key={i} x1={i % 5 === 0 ? 0 : 6} y1={10 + i * 9} x2={30} y2={10 + i * 9}
              stroke="#c49a2e" strokeWidth={i % 5 === 0 ? 1.2 : 0.6} />
          ))}
          {/* 자 숫자 */}
          {[0, 5, 10, 15].map((n, i) => (
            <text key={n} x="3" y={10 + i * 45 + 4} fontSize="7" fill="#b07d20" fontFamily="monospace">{n}</text>
          ))}
          {/* cm 표시 */}
          <text x="5" y="230" fontSize="7" fill="#b07d20">cm</text>
        </g>

        {/* 연필 */}
        <g transform="translate(260, 30) rotate(-35)">
          <rect x="0" y="0" width="6" height="28" fill="#fde68a" stroke="#d97706" strokeWidth="0.8" />
          <polygon points="0,28 6,28 3,36" fill="#fcd34d" stroke="#d97706" strokeWidth="0.8" />
          <polygon points="2,34 4,34 3,36" fill="#1f2937" />
          <rect x="0" y="0" width="6" height="5" fill="#f87171" stroke="#d97706" strokeWidth="0.8" />
          <rect x="0" y="5" width="6" height="2" fill="#d1d5db" stroke="#d97706" strokeWidth="0.6" />
        </g>

        {/* (0,0) 좌표 표시 */}
        <text x={gridOffset + 2} y={gridOffset + cellSize * 8 + 14} fontSize="9" fill="#6b7280" fontFamily="monospace">(0,0)</text>
        <text x={gridOffset + cellSize * 7 - 8} y={gridOffset - 18} fontSize="9" fill="#6b7280" fontFamily="monospace">(7,0)</text>
      </svg>

      <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 max-w-xs">
        <p className="text-xs text-green-800 leading-relaxed text-center">
          전도지에 자를 이용해 가로·세로 각 <strong>8등분 격자</strong>를 그립니다.
          좌표는 <strong>(0,0)~(7,7)</strong>로 표시하세요.
        </p>
      </div>
    </div>
  )
}

// ── 슬라이드 2: 9V 건전지 전극 설치 ─────────────────────────
function Slide2() {
  const cellSize = 26
  const gridOffset = 50
  const gridSize = cellSize * 8

  // 격자선
  const gridLines = []
  for (let i = 0; i <= 8; i++) {
    gridLines.push(
      <line key={`gh${i}`} x1={gridOffset} y1={gridOffset + i * cellSize}
        x2={gridOffset + gridSize} y2={gridOffset + i * cellSize}
        stroke="#9ca3af" strokeWidth="0.7" />,
      <line key={`gv${i}`} x1={gridOffset + i * cellSize} y1={gridOffset}
        x2={gridOffset + i * cellSize} y2={gridOffset + gridSize}
        stroke="#9ca3af" strokeWidth="0.7" />
    )
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <svg width="320" height="310" viewBox="0 0 320 310">
        {/* 전도지 배경 */}
        <rect x={gridOffset - 4} y={gridOffset - 4} width={gridSize + 8} height={gridSize + 8}
          rx="4" fill="#fefce8" stroke="#fde047" strokeWidth="1.5" />
        {gridLines}

        {/* 건전지 (오른쪽 위) */}
        <g transform="translate(235, 15)">
          {/* 건전지 몸통 */}
          <rect x="0" y="8" width="50" height="70" rx="4" fill="#374151" stroke="#1f2937" strokeWidth="1.5" />
          {/* + 단자 */}
          <rect x="8" y="2" width="14" height="8" rx="2" fill="#ef4444" />
          <text x="15" y="9" textAnchor="middle" fontSize="8" fill="white" fontWeight="bold">+</text>
          {/* - 단자 */}
          <rect x="28" y="2" width="14" height="8" rx="2" fill="#6366f1" />
          <text x="35" y="9" textAnchor="middle" fontSize="8" fill="white" fontWeight="bold">−</text>
          {/* 라벨 */}
          <text x="25" y="42" textAnchor="middle" fontSize="8" fill="#d1d5db" fontWeight="bold">9V</text>
          <text x="25" y="55" textAnchor="middle" fontSize="6" fill="#9ca3af">BATTERY</text>
          {/* 줄무늬 */}
          {[0, 1, 2, 3].map(i => (
            <rect key={i} x="5" y={65 + i * 3} width="40" height="1.5" rx="0.5" fill="#4b5563" />
          ))}
        </g>

        {/* (+) 전선: 건전지 → 좌상단 */}
        <path d="M243,15 C230,10 180,5 46,46" fill="none" stroke="#ef4444" strokeWidth="2" strokeDasharray="none" />
        {/* (+) 핀/클립 — 좌상단 */}
        <circle cx="46" cy="46" r="6" fill="#ef4444" stroke="#dc2626" strokeWidth="1.5" />
        <text x="46" y="49.5" textAnchor="middle" fontSize="7" fill="white" fontWeight="bold">+</text>
        <text x="20" y="42" fontSize="8" fill="#ef4444" fontWeight="bold">(+)</text>

        {/* (−) 전선: 건전지 → 우하단 */}
        <path d="M257,15 C260,10 300,200 274,261" fill="none" stroke="#6366f1" strokeWidth="2" />
        {/* (−) 핀/클립 — 우하단 */}
        <circle cx="274" cy="261" r="6" fill="#6366f1" stroke="#4f46e5" strokeWidth="1.5" />
        <text x="274" y="264.5" textAnchor="middle" fontSize="7" fill="white" fontWeight="bold">−</text>
        <text x="280" y="270" fontSize="8" fill="#6366f1" fontWeight="bold">(−)</text>

        {/* 테이프 힌트 (하단) */}
        <rect x={gridOffset + 10} y={gridOffset + gridSize + 6} width="40" height="8" rx="2"
          fill="#bfdbfe" stroke="#93c5fd" strokeWidth="1" opacity="0.8" />
        <text x={gridOffset + 30} y={gridOffset + gridSize + 12} textAnchor="middle" fontSize="6" fill="#1d4ed8">테이프</text>

        <rect x={gridOffset + gridSize - 50} y={gridOffset + gridSize + 6} width="40" height="8" rx="2"
          fill="#bfdbfe" stroke="#93c5fd" strokeWidth="1" opacity="0.8" />
        <text x={gridOffset + gridSize - 30} y={gridOffset + gridSize + 12} textAnchor="middle" fontSize="6" fill="#1d4ed8">테이프</text>

        {/* 책 (배경) */}
        <rect x="8" y={gridOffset + gridSize + 2} width={gridSize + 84} height="14" rx="3"
          fill="#e5e7eb" stroke="#d1d5db" strokeWidth="1" />
        <text x={(gridSize + 100) / 2} y={gridOffset + gridSize + 12} textAnchor="middle" fontSize="7" fill="#6b7280">두꺼운 책</text>
      </svg>

      <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 max-w-xs">
        <p className="text-xs text-yellow-800 leading-relaxed text-center">
          9V 건전지 양극(+)을 격자 외부 <strong>좌상단</strong>, 음극(−)을 <strong>우하단</strong>에
          클립이나 압정으로 연결합니다.<br />
          코르크판이 없으면 두꺼운 책 위에 놓고 <strong>테이프로 고정</strong>하세요.
        </p>
      </div>
    </div>
  )
}

// ── 슬라이드 3: 멀티미터 측정 방법 ──────────────────────────
function Slide3() {
  const cellSize = 26
  const gridOffset = 30
  const gridSize = cellSize * 8

  // 격자선
  const gridLines = []
  for (let i = 0; i <= 8; i++) {
    gridLines.push(
      <line key={`gh${i}`} x1={gridOffset} y1={gridOffset + i * cellSize}
        x2={gridOffset + gridSize} y2={gridOffset + i * cellSize}
        stroke="#9ca3af" strokeWidth="0.7" />,
      <line key={`gv${i}`} x1={gridOffset + i * cellSize} y1={gridOffset}
        x2={gridOffset + i * cellSize} y2={gridOffset + gridSize}
        stroke="#9ca3af" strokeWidth="0.7" />
    )
  }

  // 측정 이동 점 (빨간 프로브 이동 경로)
  const movingPoints = [
    { x: 2, y: 2 }, { x: 3, y: 3 }, { x: 4, y: 4 }, { x: 5, y: 5 }
  ]

  return (
    <div className="flex flex-col items-center gap-4">
      <svg width="320" height="310" viewBox="0 0 320 310">
        {/* 전도지 배경 */}
        <rect x={gridOffset - 4} y={gridOffset - 4} width={gridSize + 8} height={gridSize + 8}
          rx="4" fill="#fafafa" stroke="#e5e7eb" strokeWidth="1.5" />
        {gridLines}

        {/* (+) 전극 표시 */}
        <circle cx={gridOffset} cy={gridOffset} r="7" fill="#ef4444" stroke="#dc2626" strokeWidth="1.5" />
        <text x={gridOffset} y={gridOffset + 3.5} textAnchor="middle" fontSize="7" fill="white" fontWeight="bold">+</text>

        {/* (−) 전극 표시 (고정점) */}
        <circle cx={gridOffset + gridSize} cy={gridOffset + gridSize} r="7" fill="#6366f1" stroke="#4f46e5" strokeWidth="1.5" />
        <text x={gridOffset + gridSize} y={gridOffset + gridSize + 3.5} textAnchor="middle" fontSize="7" fill="white" fontWeight="bold">−</text>

        {/* 고정 전극 (검은 프로브) 위치 */}
        <circle cx={gridOffset + 6 * cellSize} cy={gridOffset + 6 * cellSize} r="5"
          fill="#1f2937" stroke="#374151" strokeWidth="1.5" />
        <text x={gridOffset + 6 * cellSize + 8} y={gridOffset + 6 * cellSize + 4}
          fontSize="7" fill="#374151">고정</text>

        {/* 이동하는 빨간 프로브 포인트들 */}
        {movingPoints.map((pt, i) => (
          <g key={i}>
            <circle
              cx={gridOffset + pt.x * cellSize}
              cy={gridOffset + pt.y * cellSize}
              r="5"
              fill="#ef4444"
              stroke="#dc2626"
              strokeWidth="1.5"
              opacity={0.4 + i * 0.2}
            />
          </g>
        ))}

        {/* 현재 측정 중인 프로브 (강조) */}
        <circle cx={gridOffset + 4 * cellSize} cy={gridOffset + 4 * cellSize} r="7"
          fill="#ef4444" stroke="#dc2626" strokeWidth="2" />
        <circle cx={gridOffset + 4 * cellSize} cy={gridOffset + 4 * cellSize} r="12"
          fill="none" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="3 2" opacity="0.5" />

        {/* 이동 화살표 */}
        <path d={`M${gridOffset + 2 * cellSize + 6},${gridOffset + 2 * cellSize + 6} L${gridOffset + 4 * cellSize - 8},${gridOffset + 4 * cellSize - 8}`}
          stroke="#ef4444" strokeWidth="1.5" fill="none" markerEnd="url(#arrowRed)" strokeDasharray="4 2" />

        {/* 멀티미터 (오른쪽) */}
        <g transform="translate(248, 60)">
          {/* 본체 */}
          <rect x="0" y="0" width="64" height="90" rx="8" fill="#1f2937" stroke="#374151" strokeWidth="2" />
          {/* 화면 */}
          <rect x="6" y="8" width="52" height="28" rx="4" fill="#d1fae5" stroke="#6ee7b7" strokeWidth="1" />
          <text x="32" y="24" textAnchor="middle" fontSize="12" fill="#065f46" fontFamily="monospace" fontWeight="bold">2.34</text>
          <text x="32" y="33" textAnchor="middle" fontSize="7" fill="#047857">V</text>
          {/* 다이얼 */}
          <circle cx="32" cy="62" r="14" fill="#374151" stroke="#4b5563" strokeWidth="2" />
          <circle cx="32" cy="62" r="5" fill="#6b7280" />
          <line x1="32" y1="48" x2="32" y2="56" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" />
          {/* V 표시 */}
          <text x="32" y="82" textAnchor="middle" fontSize="7" fill="#9ca3af">DCV</text>
          {/* 프로브 단자 */}
          <circle cx="22" cy="86" r="3" fill="#ef4444" />
          <circle cx="36" cy="86" r="3" fill="#1f2937" stroke="#6b7280" strokeWidth="1" />
          <circle cx="50" cy="86" r="3" fill="#6b7280" />
          <text x="22" y="96" textAnchor="middle" fontSize="5" fill="#ef4444">V/Ω</text>
          <text x="50" y="96" textAnchor="middle" fontSize="5" fill="#9ca3af">COM</text>
        </g>

        {/* 빨간 프로브선: 멀티미터 → 격자점 */}
        <path d={`M258,148 C240,160 180,160 ${gridOffset + 4 * cellSize},${gridOffset + 4 * cellSize}`}
          fill="none" stroke="#ef4444" strokeWidth="2" />

        {/* 검은 프로브선: 멀티미터 → 고정점 */}
        <path d={`M268,148 C270,180 ${gridOffset + 7 * cellSize + 10},${gridOffset + 7 * cellSize - 10} ${gridOffset + 6 * cellSize},${gridOffset + 6 * cellSize}`}
          fill="none" stroke="#374151" strokeWidth="2" />

        {/* 화살표 마커 정의 */}
        <defs>
          <marker id="arrowRed" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="#ef4444" />
          </marker>
        </defs>

        {/* "이동하며 측정" 라벨 */}
        <text x={gridOffset + 4 * cellSize} y={gridOffset + 4 * cellSize - 18}
          textAnchor="middle" fontSize="8" fill="#ef4444" fontWeight="bold">이동 측정</text>
        <text x={gridOffset + 6 * cellSize + 8} y={gridOffset + 6 * cellSize + 14}
          fontSize="7" fill="#374151">고정(COM)</text>
      </svg>

      <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 max-w-xs">
        <p className="text-xs text-indigo-800 leading-relaxed text-center">
          검은(COM) 프로브를 <strong>음극 근처에 고정</strong>하고,
          빨간 프로브를 각 격자점에 <strong>차례로 옮기며</strong> 전위(V)를 읽습니다.
        </p>
      </div>
    </div>
  )
}

// ── 메인 모달 컴포넌트 ───────────────────────────────────────
const SLIDES = [
  {
    step: 1,
    title: '전도지 격자 그리기',
    icon: '📐',
    component: Slide1,
  },
  {
    step: 2,
    title: '9V 건전지 전극 설치',
    icon: '🔋',
    component: Slide2,
  },
  {
    step: 3,
    title: '멀티미터 측정 방법',
    icon: '🔬',
    component: Slide3,
  },
]

export default function ExperimentGuideModal({ onClose }) {
  const [currentSlide, setCurrentSlide] = useState(0)

  const slide = SLIDES[currentSlide]
  const SlideComponent = slide.component

  function goPrev() {
    setCurrentSlide(i => Math.max(0, i - 1))
  }
  function goNext() {
    setCurrentSlide(i => Math.min(SLIDES.length - 1, i + 1))
  }

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* 헤더 */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-blue-200 text-xs font-medium">실험 준비 안내</p>
            <h2 className="text-white text-lg font-bold mt-0.5">
              {slide.icon} {slide.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-blue-200 hover:text-white transition-colors p-1"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 단계 인디케이터 */}
        <div className="px-6 pt-4 flex items-center justify-center gap-2">
          {SLIDES.map((s, i) => (
            <button
              key={i}
              onClick={() => setCurrentSlide(i)}
              className={[
                'transition-all duration-200 rounded-full',
                i === currentSlide
                  ? 'w-6 h-2 bg-blue-600'
                  : i < currentSlide
                  ? 'w-2 h-2 bg-blue-300'
                  : 'w-2 h-2 bg-gray-200'
              ].join(' ')}
            />
          ))}
        </div>
        <div className="text-center mt-1.5 mb-0">
          <span className="text-xs text-gray-400">{currentSlide + 1} / {SLIDES.length}</span>
        </div>

        {/* 슬라이드 콘텐츠 */}
        <div className="px-4 py-2">
          <SlideComponent />
        </div>

        {/* 하단 버튼 */}
        <div className="px-6 pb-6 flex items-center gap-3">
          <button
            onClick={goPrev}
            disabled={currentSlide === 0}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ← 이전
          </button>

          {currentSlide < SLIDES.length - 1 ? (
            <button
              onClick={goNext}
              className="flex-2 flex-grow py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-colors shadow-md"
            >
              다음 →
            </button>
          ) : (
            <button
              onClick={onClose}
              className="flex-2 flex-grow py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-bold transition-colors shadow-md"
            >
              준비 완료! 닫기
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
