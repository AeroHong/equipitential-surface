import React, { useState } from 'react'
import { fullscreenSupported, formatDuration, LEAVE_TYPE_LABELS } from '../utils/focusGuard.js'

/**
 * 화면 이탈 감지(hooks/useFocusGuard.js)용 전체 화면 가림막 두 가지.
 *   mode="start": 제한시간 평가를 시작하기 전 안내 + 전체화면 진입 버튼
 *   mode="warning": 이탈했다가 돌아왔을 때(또는 전체화면이 풀렸을 때) 경고 — 버튼을 눌러야 계속 작성
 */
export default function FocusGuardOverlay({ mode, warning, fullscreenLost, usingFullscreen, totalLeaveCount, onStart, onAcknowledge }) {
  const [busy, setBusy] = useState(false)
  const canFullscreen = fullscreenSupported()

  async function handleClick(fn) {
    setBusy(true)
    try { await fn() } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/70 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl text-center">
        {mode === 'start' ? (
          <>
            <p className="text-4xl mb-2">📝</p>
            <p className="text-lg font-bold text-gray-900 mb-2">평가를 시작합니다</p>
            <ul className="text-left text-sm text-gray-600 space-y-1.5 mb-5 bg-gray-50 rounded-xl p-4">
              <li>• 평가 중에는 {canFullscreen ? '전체화면으로 작성합니다.' : '이 화면에서만 작성합니다.'}</li>
              <li>• <b className="text-red-600">다른 탭·앱으로 이동하거나 {canFullscreen ? '전체화면을 빠져나가면' : '화면을 벗어나면'}</b> 횟수와 시간이 선생님께 바로 전달됩니다.</li>
              <li>• 답안에 이미지를 첨부할 때 열리는 사진 선택 창은 괜찮습니다.</li>
            </ul>
            <button
              type="button"
              disabled={busy}
              onClick={() => handleClick(onStart)}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm disabled:opacity-40"
            >
              {canFullscreen ? '전체화면으로 시작하기' : '시작하기'}
            </button>
          </>
        ) : (
          <>
            <p className="text-4xl mb-2">⚠️</p>
            <p className="text-lg font-bold text-red-600 mb-2">
              {warning ? '화면 이탈이 감지되었습니다' : '전체화면이 해제되었습니다'}
            </p>
            <p className="text-sm text-gray-600 mb-1">
              {warning
                ? <>{LEAVE_TYPE_LABELS[warning.type] || '화면 이탈'} · {formatDuration(warning.durationMs)} 동안 벗어나 있었습니다.</>
                : '평가 중에는 전체화면을 유지해야 합니다.'}
            </p>
            <p className="text-sm text-gray-600 mb-5">
              이 기록은 선생님께 전달되었습니다{totalLeaveCount > 0 ? ` (지금까지 ${totalLeaveCount}회)` : ''}.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => handleClick(onAcknowledge)}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm disabled:opacity-40"
            >
              {usingFullscreen ? '전체화면으로 돌아가 계속 작성' : '확인하고 계속 작성'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
