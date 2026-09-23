import React from 'react'

const STATE_STYLE = {
  typing: { label: '⌨️ 입력 중', className: 'bg-green-100 text-green-700 border-green-200' },
  viewing: { label: '👀 보는 중', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  away: { label: '↪️ 다른 화면', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  offline: { label: '⚪ 오프라인', className: 'bg-gray-100 text-gray-400 border-gray-200' }
}

// 교사 대시보드용 실시간 접속 상태 뱃지 — usePresence.js가 RTDB presence/{assignmentId}/{uid}에
// 기록한 state를 그대로 받아 표시한다. presence 데이터가 없으면(RTDB 미설정 또는 학생이 아직
// 한 번도 접속하지 않음) 판정 불가로 표시한다.

export default function PresenceBadge({ state }) {
  const style = state && STATE_STYLE[state]
  if (!style) {
    return <span className="text-xs text-gray-300">—</span>
  }
  return (
    <span className={`text-xs rounded-full px-2 py-0.5 border font-medium ${style.className}`}>
      {style.label}
    </span>
  )
}
