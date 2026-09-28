import { useEffect, useState } from 'react'
import { ref, onValue } from 'firebase/database'
import { rtdb } from '../firebase.js'

/**
 * 이 기기 시계와 서버 시계의 차이(ms) — 서버 시각 ≈ Date.now() + offset. 제한시간 종료를
 * 학생 태블릿 시계가 아니라 서버 시각 기준으로 맞추려고 쓴다(기기 시계가 몇 분씩 틀린 경우가
 * 흔함). RTDB가 기본 제공하는 .info/serverTimeOffset을 읽고, RTDB가 없으면 0(기기 시계 그대로).
 * @returns {number}
 */
export function useServerTimeOffset() {
  const [offset, setOffset] = useState(0)
  useEffect(() => {
    if (!rtdb) return
    return onValue(ref(rtdb, '.info/serverTimeOffset'), snap => setOffset(Number(snap.val()) || 0))
  }, [])
  return offset
}
