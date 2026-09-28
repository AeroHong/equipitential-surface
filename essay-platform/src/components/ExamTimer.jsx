import React, { useEffect, useRef, useState } from 'react'
import { formatRemaining } from '../utils/examTimer.js'

/**
 * 학생 화면 상단의 남은 시간 표시. 매초 다시 그리는 건 이 작은 컴포넌트만 하고(작성 화면
 * 전체가 매초 리렌더되지 않게), 시간이 다 되면 onExpire를 딱 한 번 부른다.
 * @param {{deadlineMs: number, serverOffsetMs: number, onExpire: () => void}} props
 */
export default function ExamTimer({ deadlineMs, serverOffsetMs, onExpire }) {
  const [now, setNow] = useState(() => Date.now() + serverOffsetMs)
  const firedRef = useRef(false)
  const onExpireRef = useRef(onExpire)
  onExpireRef.current = onExpire

  useEffect(() => {
    const tick = () => setNow(Date.now() + serverOffsetMs)
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [serverOffsetMs])

  const remaining = deadlineMs - now

  useEffect(() => {
    // 교사가 제한시간을 늘리면(deadlineMs가 커지면) 다시 발화할 수 있게 되돌린다.
    if (remaining > 0) { firedRef.current = false; return }
    if (firedRef.current) return
    firedRef.current = true
    onExpireRef.current?.()
  }, [remaining])

  const tone = remaining <= 60_000
    ? 'bg-red-100 text-red-700 animate-pulse'
    : remaining <= 5 * 60_000
      ? 'bg-amber-100 text-amber-700'
      : 'bg-gray-100 text-gray-700'

  return (
    <span className={`rounded-full px-3 py-1 text-sm font-bold tabular-nums ${tone}`} title="남은 시간">
      ⏱ {remaining > 0 ? formatRemaining(remaining) : '시간 종료'}
    </span>
  )
}
