import React from 'react'

// 교사 대시보드용 AI 의심 신호 배지 — 단독 판정이 아닌 참고용 보조 신호

export default function AiFlagBadge({ aiFlags }) {
  const score = aiFlags?.score || 0
  if (score === 0) {
    return <span className="text-xs text-gray-300">—</span>
  }
  const level = score >= 6 ? 'high' : score >= 3 ? 'mid' : 'low'
  const style = {
    high: 'bg-red-100 text-red-700 border-red-200',
    mid: 'bg-amber-100 text-amber-700 border-amber-200',
    low: 'bg-gray-100 text-gray-600 border-gray-200'
  }[level]
  const label = {
    high: '⚠️ 강한 신호',
    mid: '⚠️ 신호 있음',
    low: '약한 신호'
  }[level]

  const detail = [
    ...(aiFlags.phraseMatches || []).map(p => `"${p}"`),
    aiFlags.markdownHits ? '마크다운 서식 흔적' : null
  ].filter(Boolean).join(', ')

  return (
    <span
      title={detail || undefined}
      className={`text-xs rounded-full px-2 py-0.5 border font-medium ${style}`}
    >
      {label}
    </span>
  )
}
