import { useCallback, useEffect, useRef, useState } from 'react'

const RETRY_DELAY_MS = 3000

/**
 * debounce 자동저장 훅. 값 변경을 자동으로 watch하지 않고 호출자가 trigger(value)를
 * 명시적으로 불러야 저장이 예약된다 — 그래야 "서버에서 불러온 초기값 세팅"과
 * "사용자가 실제로 타이핑한 변경"이 뒤섞여 불필요한 저장이 발생하지 않는다.
 * (physlab Step1Input의 debounce 패턴을 일반화하고, 언마운트/탭 이탈 시 강제 flush를 추가)
 *
 * 저장은 promise 체인 하나로 직렬화한다 — flushNow()는 "지금 대기 중인 값"뿐 아니라 이미
 * 서버로 보내는 중인 저장까지 끝나야 resolve된다. 예전엔 진행 중인 저장을 기다리지 않아서,
 * 디바운스가 막 발사된 직후 "실험 시작"처럼 페이지를 옮기면 그 쓰기가 끊겨 사라졌다.
 * 실패하면 값을 다시 대기 상태로 돌려 RETRY_DELAY_MS 뒤 재시도한다(다음 입력을 기다리지 않음).
 * 저장이 끝나기 전에 페이지를 떠나려 하면 브라우저 확인창(beforeunload)으로 붙잡는다.
 *
 * @param {(value: any) => Promise<void>} saveFn
 * @param {{delay?: number}} [options]
 * @returns {{saveState: 'idle'|'saving'|'saved'|'error', trigger: (value:any)=>void, flushNow: () => Promise<void>}}
 */
export function useAutosave(saveFn, { delay = 700 } = {}) {
  const [saveState, setSaveState] = useState('idle')
  const debounceTimer = useRef(null)
  const retryTimer = useRef(null)
  const saveFnRef = useRef(saveFn)
  const pendingRef = useRef(false)
  const inFlightRef = useRef(false)
  const latestValueRef = useRef(undefined)
  const chainRef = useRef(Promise.resolve())
  saveFnRef.current = saveFn

  const flushRef = useRef(null)
  flushRef.current = flushRef.current || (() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
      debounceTimer.current = null
    }
    if (retryTimer.current) {
      clearTimeout(retryTimer.current)
      retryTimer.current = null
    }
    chainRef.current = chainRef.current.then(async () => {
      if (!pendingRef.current) return
      pendingRef.current = false
      inFlightRef.current = true
      setSaveState('saving')
      try {
        await saveFnRef.current(latestValueRef.current)
        // 저장하는 동안 새로 입력됐으면 아직 '저장됨'이 아니다 — 디바운스가 곧 다시 저장한다.
        if (!pendingRef.current) setSaveState('saved')
      } catch (err) {
        console.error('자동저장 실패:', err)
        pendingRef.current = true
        setSaveState('error')
        if (!retryTimer.current) {
          retryTimer.current = setTimeout(() => {
            retryTimer.current = null
            flushRef.current()
          }, RETRY_DELAY_MS)
        }
      } finally {
        inFlightRef.current = false
      }
    })
    return chainRef.current
  })

  const trigger = useCallback((value) => {
    latestValueRef.current = value
    pendingRef.current = true
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    setSaveState('saving')
    debounceTimer.current = setTimeout(() => { flushRef.current() }, delay)
  }, [delay])

  const flushNow = useCallback(() => flushRef.current(), [])

  // 언마운트 시 대기 중인 변경사항 즉시 저장, 재시도 타이머 정리
  useEffect(() => {
    return () => {
      flushRef.current()
      if (retryTimer.current) clearTimeout(retryTimer.current)
    }
  }, [])

  // 탭 전환/닫기 시 저장. beforeunload 시점엔 visibilityState가 아직 'visible'이라 예전처럼
  // hidden 여부로 거르면 아무것도 저장되지 않았다 — 이벤트별로 따로 처리한다.
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'hidden') flushRef.current()
    }
    function handlePageHide() {
      flushRef.current()
    }
    function handleBeforeUnload(e) {
      if (!pendingRef.current && !inFlightRef.current) return
      flushRef.current()
      // 확인창이 떠 있는 동안 저장이 마저 끝난다. 학생이 "머무르기"를 고르면 그대로 이어서 쓴다.
      e.preventDefault()
      e.returnValue = ''
    }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('pagehide', handlePageHide)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [])

  return { saveState, trigger, flushNow }
}
