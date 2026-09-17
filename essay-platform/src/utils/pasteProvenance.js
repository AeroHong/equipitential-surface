import { htmlToPlainText } from './richText.js'

// "붙여넣기 비율" 계산이 지금까지 이랬다: 붙여넣은 글자 수를 전부 더한 값(pastedCharTotal) /
// 최종 글자 수. 문제는 학생이 붙여넣었다가 그 부분을 지우고 직접 다시 쓴 경우에도 붙여넣은
// 글자 수가 그대로 합산에 남아있어서 비율이 실제보다 부풀려진다는 것 — "붙여넣었지만 지금은
// 최종본에 남아있지 않은 글자"까지 붙여넣기로 잡는 게 문제다. 이 파일은 입력 스냅샷
// (inputEvents, 매번 전체 텍스트)과 붙여넣기 이벤트(pasteEvents, 삽입 위치+길이)를 시간순으로
// 재생하면서 각 글자에 "이 글자는 붙여넣어진 것인지"를 표시해 최종본에 실제로 살아남은
// 붙여넣기 글자 수만 센다.

function commonPrefixLen(a, b) {
  let i = 0
  const max = Math.min(a.length, b.length)
  while (i < max && a[i] === b[i]) i++
  return i
}

function commonSuffixLen(a, b, prefixLen) {
  let i = 0
  const maxA = a.length - prefixLen
  const maxB = b.length - prefixLen
  const max = Math.min(maxA, maxB)
  while (i < max && a[a.length - 1 - i] === b[b.length - 1 - i]) i++
  return i
}

/**
 * @param {Array<{t:number, value:string}>} inputEvents - 매 순간 전체 텍스트 스냅샷(HTML 또는 평문)
 * @param {Array<{t:number, charCount:number, cursorPos:number}>} pasteEvents
 * @returns {{ finalLength: number, survivingPastedLength: number }}
 */
export function computeSurvivingPaste(inputEvents, pasteEvents) {
  // 같은 붙여넣기 동작이 paste 이벤트와 그 직후의 input 스냅샷(EssayEditor.jsx의
  // handlePaste → onLogPaste 다음 줄의 commit())을 각각 남기는데, 두 Date.now() 호출이
  // 1ms 이내에 연달아 일어나 타임스탬프가 같을 수 있다. 정렬이 동점일 때 paste가 먼저
  // 오도록 배열에서도 paste를 앞에 둔다(Array#sort는 안정 정렬이라 원래 순서가 유지됨).
  const timeline = [
    ...pasteEvents.map(e => ({ t: e.t, kind: 'paste', charCount: e.charCount, cursorPos: e.cursorPos })),
    ...inputEvents.map(e => ({ t: e.t, kind: 'input', text: htmlToPlainText(e.value) }))
  ].sort((a, b) => a.t - b.t)

  let text = ''
  let origin = [] // 글자 하나하나가 붙여넣기 기원인지(true/false)
  let pendingPaste = null // 방금 일어난 붙여넣기 — 바로 다음 input 스냅샷에서 실제 글자로 채워진다

  for (const ev of timeline) {
    if (ev.kind === 'paste') {
      pendingPaste = {
        pos: Math.max(0, Math.min(ev.cursorPos ?? 0, text.length)),
        charCount: Math.max(0, ev.charCount || 0)
      }
      continue
    }

    const next = ev.text
    const prefixLen = commonPrefixLen(text, next)
    const suffixLen = commonSuffixLen(text, next, prefixLen)
    const removedCount = Math.max(0, text.length - prefixLen - suffixLen)
    const insertedCount = Math.max(0, next.length - prefixLen - suffixLen)

    const insertedOrigin = new Array(insertedCount).fill(false)
    // 방금 붙여넣기 직후의 첫 스냅샷이고, 삭제 없이 그 위치에 붙여넣은 만큼(또는 그 이상,
    // IME 조합 등으로 살짝 더 늘었을 수 있음) 새 글자가 들어왔다면 그 구간만 pasted로 표시.
    // 조건이 안 맞으면(다른 이벤트가 먼저 끼어듦 등) 안전하게 typed로 둔다 — 비율을
    // 과대평가하는 쪽보다는 과소평가하는 쪽이 낫다.
    if (pendingPaste && removedCount === 0 && prefixLen <= pendingPaste.pos && insertedCount >= pendingPaste.charCount) {
      const startWithin = pendingPaste.pos - prefixLen
      for (let i = 0; i < pendingPaste.charCount; i++) {
        const idx = startWithin + i
        if (idx >= 0 && idx < insertedOrigin.length) insertedOrigin[idx] = true
      }
    }
    pendingPaste = null

    origin.splice(prefixLen, removedCount, ...insertedOrigin)
    text = next
  }

  return {
    finalLength: text.length,
    survivingPastedLength: origin.filter(Boolean).length
  }
}
