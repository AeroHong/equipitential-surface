import React from 'react'

// physlab Step1Input.jsx의 자동저장 배지와 동일한 톤(amber=저장중, green=저장됨)

export default function SaveStateLabel({ state }) {
  if (state === 'saving') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-amber-600">
        <div className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        저장 중...
      </div>
    )
  }
  if (state === 'saved') {
    return (
      <div className="flex items-center gap-1 text-xs text-green-600">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
        저장됨
      </div>
    )
  }
  if (state === 'error') {
    return (
      <div className="flex items-center gap-1 text-xs text-red-500">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        저장 실패
      </div>
    )
  }
  return null
}
