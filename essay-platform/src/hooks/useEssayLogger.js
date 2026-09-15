import { useCallback, useEffect, useRef } from 'react'
import { appendInputLogBatch, appendKeydownLogBatch, addPasteLog } from '../services/essay.js'

// 로그 스트림별 배치 임계값 — Firestore 문서 크기(1MB)/쓰기횟수를 고려한 절충값
const INPUT_BATCH_LIMIT = 150
const KEYDOWN_BATCH_LIMIT = 500
const FLUSH_INTERVAL_MS = 10000

/**
 * 에세이 에디터의 paste/keydown/input 이벤트를 버퍼링해 주기적으로 Firestore에 flush하는 훅.
 *
 * - input 스트림: 확정된 전체 텍스트 스냅샷 {t, value, selStart, inputType} — 리플레이 재구성의 권위 있는 소스
 * - keydown 스트림: 타이밍 전용 {t, k} — 값은 저장하지 않음(한글 IME 조합 중간 상태 노이즈 회피)
 * - paste 스트림: 저빈도라 이벤트마다 즉시 1건씩 저장
 *
 * 완전 실시간(이벤트당 1문서)은 쓰기비용 폭증, 완전 지연(제출 시 일괄)은 탭이 죽으면 로그 전체 유실이라
 * 배치+주기적 flush로 절충한다.
 */
export function useEssayLogger(submissionId) {
  const inputBufRef = useRef([])
  const keydownBufRef = useRef([])
  const timerRef = useRef(null)
  const submissionIdRef = useRef(submissionId)
  submissionIdRef.current = submissionId

  const flushNow = useCallback(async () => {
    const id = submissionIdRef.current
    if (!id) return
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const inputEvents = inputBufRef.current
    const keydownEvents = keydownBufRef.current
    inputBufRef.current = []
    keydownBufRef.current = []
    try {
      const tasks = []
      if (inputEvents.length) tasks.push(appendInputLogBatch(id, inputEvents))
      if (keydownEvents.length) tasks.push(appendKeydownLogBatch(id, keydownEvents))
      if (tasks.length) await Promise.all(tasks)
    } catch (err) {
      console.error('작성 로그 저장 실패:', err)
    }
  }, [])

  function scheduleFlush() {
    if (timerRef.current) return
    timerRef.current = setTimeout(() => { flushNow() }, FLUSH_INTERVAL_MS)
  }

  const logInput = useCallback((entry) => {
    inputBufRef.current.push({ t: Date.now(), ...entry })
    if (inputBufRef.current.length >= INPUT_BATCH_LIMIT) flushNow()
    else scheduleFlush()
  }, [flushNow])

  const logKeydown = useCallback((k) => {
    keydownBufRef.current.push({ t: Date.now(), k })
    if (keydownBufRef.current.length >= KEYDOWN_BATCH_LIMIT) flushNow()
    else scheduleFlush()
  }, [flushNow])

  const logPaste = useCallback(async (entry) => {
    const id = submissionIdRef.current
    if (!id) return
    try {
      await addPasteLog(id, { t: Date.now(), ...entry })
    } catch (err) {
      console.error('붙여넣기 로그 저장 실패:', err)
    }
  }, [])

  // 언마운트 시 대기 중인 버퍼 강제 flush
  useEffect(() => {
    return () => { flushNow() }
  }, [flushNow])

  // 탭 전환/닫기 시 best-effort flush
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'hidden') flushNow()
    }
    window.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('beforeunload', handleVisibility)
    return () => {
      window.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('beforeunload', handleVisibility)
    }
  }, [flushNow])

  return { logInput, logKeydown, logPaste, flushNow }
}
