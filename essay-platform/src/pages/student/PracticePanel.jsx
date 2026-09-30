import React, { useEffect, useState } from 'react'
import EssayEditor from '../../components/EssayEditor.jsx'

/**
 * 대기실(assignment.waitingRoomEnabled) 화면의 왼쪽 칸 — 교사가 "평가 시작"을 누르기 전까지
 * 실제 평가와 같은 입력창(수식 입력 포함)을 써볼 수 있게 한다. 입력 내용은 이 컴포넌트의
 * 로컬 state에만 있고 저장·로깅·제출되지 않으며, 평가가 시작되면 이 컴포넌트와 함께 사라진다.
 * paused: 평가 중 교사가 일시정지("대기실로 보내기")한 경우 — 안내 문구만 다르다.
 * @param {{calculatorEnabled: boolean, paused?: boolean}} props
 */
export default function PracticePanel({ calculatorEnabled, paused = false }) {
  const [text, setText] = useState('')
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const startedAt = Date.now()
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => clearInterval(id)
  }, [])

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-amber-800">{paused ? '⏸ 평가 일시정지' : '⏳ 평가 준비 시간'}</p>
          <span className="font-mono text-xs text-amber-700">대기 {mm}:{ss}</span>
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-amber-900">
          {paused
            ? '선생님이 평가를 잠시 멈췄습니다. 남은 시간도 멈춰 있고, 작성하던 답안은 저장되어 있습니다. 선생님이 재개하면 이 화면이 자동으로 답안 화면으로 돌아갑니다.'
            : <>선생님이 평가를 시작하면 이 화면이 자동으로 문항으로 바뀝니다. 그 전까지
              {calculatorEnabled ? ' 공학용 계산기와' : ''} 아래 입력창을 자유롭게 연습해보세요.</>}
        </p>
        <p className="mt-1 text-xs text-amber-700">연습 내용은 저장·제출되지 않으며, 평가가 {paused ? '재개되면' : '시작되면'} 지워집니다.</p>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-bold text-gray-500">✏️ 연습용 입력창</p>
        <EssayEditor value={text} onChange={setText} wordLimitGuide={0} />
      </div>
    </div>
  )
}
