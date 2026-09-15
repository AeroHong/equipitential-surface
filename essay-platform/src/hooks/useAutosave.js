import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * debounce 자동저장 훅. 값 변경을 자동으로 watch하지 않고 호출자가 trigger(value)를
 * 명시적으로 불러야 저장이 예약된다 — 그래야 "서버에서 불러온 초기값 세팅"과
 * "사용자가 실제로 타이핑한 변경"이 뒤섞여 불필요한 저장이 발생하지 않는다.
 * (physlab Step1Input의 debounce 패턴을 일반화하고, 언마운트/탭 이탈 시 강제 flush를 추가)
 *
 * @param {(value: any) => Promise<void>} saveFn
 * @param {{delay?: number}} [options]
 * @returns {{saveState: 'idle'|'saving'|'saved'|'error', trigger: (value:any)=>void, flushNow: () => Promise<void>}}
 */
export function useAutosave(saveFn, { delay = 700 } = {}) {
  const [saveState, setSaveState] = useState('idle')
  const debounceTimer = useRef(null)
  const saveFnRef = useRef(saveFn)
  const pendingRef = useRef(false)
  const latestValueRef = useRef(undefined)
  saveFnRef.current = saveFn

  const flushRef = useRef(async () => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
      debounceTimer.current = null
    }
    if (!pendingRef.current) return
    pendingRef.current = false
    setSaveState('saving')
    try {
      await saveFnRef.current(latestValueRef.current)
      setSaveState('saved')
    } catch (err) {
      console.error('자동저장 실패:', err)
      setSaveState('error')
    }
  })

  const trigger = useCallback((value) => {
    latestValueRef.current = value
    pendingRef.current = true
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    setSaveState('saving')
    debounceTimer.current = setTimeout(() => { flushRef.current() }, delay)
  }, [delay])

  const flushNow = useCallback(() => flushRef.current(), [])

  // 언마운트 시 대기 중인 변경사항 즉시 저장
  useEffect(() => {
    return () => { flushRef.current() }
  }, [])

  // 탭 전환/닫기 시 best-effort 저장
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'hidden') flushRef.current()
    }
    window.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('beforeunload', handleVisibility)
    return () => {
      window.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('beforeunload', handleVisibility)
    }
  }, [])

  return { saveState, trigger, flushNow }
}
