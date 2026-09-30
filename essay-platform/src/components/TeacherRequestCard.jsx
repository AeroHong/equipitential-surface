import React from 'react'

/**
 * 처음 로그인한(아직 학생 role인) 사용자에게 보여주는 "교사 권한 요청" 카드. 선생님이 처음 들어와
 * 가장 먼저 해야 할 일이라 눈에 띄게 크게 보여준다. App.jsx의 StudentHome과 사용법 페이지(HelpPage의
 * 미리보기, preview=true — 버튼이 실제로 동작하지 않음)가 같은 컴포넌트를 써서 화면과 설명이 어긋나지 않게 한다.
 *
 * @param {{state?: 'idle'|'requesting'|'requested', error?: string, onRequest?: () => void, preview?: boolean}} props
 */
export default function TeacherRequestCard({ state = 'idle', error = '', onRequest, preview = false }) {
  return (
    <div className="w-full overflow-hidden rounded-3xl border-2 border-indigo-200 bg-white shadow-lg">
      <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-5 text-white">
        <p className="text-3xl">👩‍🏫</p>
        <p className="mt-2 text-xl font-bold">선생님이신가요?</p>
        <p className="mt-1 text-sm text-indigo-100">교사 권한을 요청하면 관리자 승인 후 지문·문항을 만들고 학생에게 배정할 수 있습니다.</p>
      </div>
      <div className="px-6 py-5">
        {state === 'requested' ? (
          <div className="rounded-2xl bg-indigo-50 px-4 py-4 text-center">
            <p className="text-base font-bold text-indigo-700">✅ 교사 권한을 요청했습니다</p>
            <p className="mt-1 text-sm text-indigo-600">관리자가 승인하면 이 화면이 자동으로 교사 홈으로 바뀝니다.</p>
          </div>
        ) : (
          <>
            <ol className="mb-4 space-y-1.5 text-sm text-gray-600">
              <li><b className="text-indigo-600">1.</b> 아래 버튼으로 교사 권한을 요청합니다.</li>
              <li><b className="text-indigo-600">2.</b> 관리자가 승인할 때까지 잠시 기다립니다.</li>
              <li><b className="text-indigo-600">3.</b> 승인되면 새로고침 없이 교사 화면이 열립니다.</li>
            </ol>
            <button
              type="button"
              onClick={preview ? undefined : onRequest}
              disabled={state === 'requesting'}
              tabIndex={preview ? -1 : undefined}
              className={`w-full rounded-2xl bg-indigo-600 py-4 text-base font-bold text-white shadow-md transition-colors hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50 ${preview ? 'pointer-events-none' : ''}`}
            >
              {state === 'requesting' ? '요청 중...' : '교사 권한 요청하기'}
            </button>
            {error && <p className="mt-2 text-center text-xs text-red-500">{error}</p>}
          </>
        )}
      </div>
    </div>
  )
}
