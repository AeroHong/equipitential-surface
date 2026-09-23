import { useCallback, useEffect, useRef } from 'react'
import { ref, onValue, onDisconnect, set, remove, serverTimestamp } from 'firebase/database'
import { rtdb } from '../firebase.js'

const TYPING_TIMEOUT_MS = 9000
const TYPING_UPDATE_THROTTLE_MS = 6000

/**
 * "지금 이 학생이 화면을 보고 있는지/입력 중인지"를 Firebase Realtime Database에 실시간으로
 * 기록하는 훅. Firestore에는 onDisconnect()가 없어 "연결이 끊기면 자동으로 오프라인 처리"가
 * 안 되므로, 이 presence 기능만 RTDB(rtdb, ../firebase.js)를 쓴다. RTDB가 설정되지 않은
 * 환경(rtdb === null, VITE_FIREBASE_DATABASE_URL 미설정)에서는 아무 것도 하지 않는다 —
 * essay-platform의 나머지 기능(작성/제출/로깅)엔 영향이 없다.
 *
 * 기록 경로: presence/{assignmentId}/{uid} = { state, lastActive }
 *   state: 'viewing'(보는 중) | 'typing'(입력 중) | 'away'(다른 탭/창으로 전환) | 'offline'(연결 끊김, onDisconnect가 자동 기록)
 *
 * @param {{assignmentId: string, uid: string, enabled: boolean}} params enabled=false가 되면
 *   (예: 제출 완료·과제 마감으로 locked) presence 기록을 정리하고 멈춘다.
 * @returns {{updateTyping: () => void}} 에디터 입력 이벤트(useEssayLogger의 logInput/logKeydown
 *   호출 지점)에서 불러주면 'typing' 상태로 갱신하고, 입력이 멈추면 자동으로 'viewing'으로 되돌린다.
 */
export function usePresence({ assignmentId, uid, enabled }) {
  const lastTypingUpdateRef = useRef(0)
  const typingRevertTimerRef = useRef(null)
  const presenceRefRef = useRef(null)

  useEffect(() => {
    if (!rtdb || !enabled || !assignmentId || !uid) return

    const presenceRef = ref(rtdb, `presence/${assignmentId}/${uid}`)
    presenceRefRef.current = presenceRef

    const setState = (state) => set(presenceRef, { state, lastActive: serverTimestamp() }).catch(() => {})

    // .info/connected는 RTDB가 내장 제공하는 특수 경로로, 연결 상태가 바뀔 때마다 값이
    // true/false로 갱신된다. 연결될 때마다(재연결 포함) onDisconnect를 다시 등록해야
    // 한다 — 이전 연결의 onDisconnect 등록은 그 연결이 끊기는 순간 서버에서 소모되기 때문.
    const unsubscribeConnected = onValue(ref(rtdb, '.info/connected'), (snap) => {
      if (snap.val() !== true) return
      onDisconnect(presenceRef).set({ state: 'offline', lastActive: serverTimestamp() })
      setState(document.visibilityState === 'hidden' ? 'away' : 'viewing')
    })

    function handleVisibility() {
      // 타이핑 직후(되돌림 타이머가 살아있는 동안)엔 그 타이머가 상태를 관리하게 둔다 —
      // 여기서 먼저 'viewing'으로 덮어쓰면 방금 기록한 'typing' 상태가 바로 사라진다.
      if (typingRevertTimerRef.current) return
      setState(document.visibilityState === 'hidden' ? 'away' : 'viewing')
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      unsubscribeConnected()
      if (typingRevertTimerRef.current) {
        clearTimeout(typingRevertTimerRef.current)
        typingRevertTimerRef.current = null
      }
      // 의도적으로 화면을 떠나는 경우(제출 완료 등)라 onDisconnect의 'offline' 기록은 취소하고
      // presence 문서 자체를 지운다 — 교사 화면에 유령 상태가 남지 않게.
      onDisconnect(presenceRef).cancel().catch(() => {})
      remove(presenceRef).catch(() => {})
      presenceRefRef.current = null
    }
  }, [assignmentId, uid, enabled])

  const updateTyping = useCallback(() => {
    const presenceRef = presenceRefRef.current
    if (!presenceRef) return
    const now = Date.now()
    if (now - lastTypingUpdateRef.current >= TYPING_UPDATE_THROTTLE_MS) {
      lastTypingUpdateRef.current = now
      set(presenceRef, { state: 'typing', lastActive: serverTimestamp() }).catch(() => {})
    }
    if (typingRevertTimerRef.current) clearTimeout(typingRevertTimerRef.current)
    typingRevertTimerRef.current = setTimeout(() => {
      typingRevertTimerRef.current = null
      if (presenceRefRef.current) {
        set(presenceRefRef.current, {
          state: document.visibilityState === 'hidden' ? 'away' : 'viewing',
          lastActive: serverTimestamp()
        }).catch(() => {})
      }
    }, TYPING_TIMEOUT_MS)
  }, [])

  return { updateTyping }
}
