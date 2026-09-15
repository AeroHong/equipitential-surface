import React, { useRef } from 'react'

/**
 * 서식 없는 순수 텍스트 논술 작성 에디터.
 * textarea를 채택한 이유: (1) 서식이 필요 없어 contentEditable/execCommand 구조가 불필요,
 * (2) selectionStart/selectionEnd로 커서 위치를 네이티브로 얻을 수 있어 로깅 정확도가 높음.
 *
 * 붙여넣기는 절대 막지 않는다(e.preventDefault 호출 안 함) — 조용히 기록만 한다.
 */
export default function EssayEditor({
  value,
  onChange,
  disabled = false,
  wordLimitGuide = 800,
  onLogInput,
  onLogKeydown,
  onLogPaste,
  placeholder = '이곳에 답안을 작성하세요…'
}) {
  const isComposingRef = useRef(false)

  function handleChange(e) {
    const newValue = e.target.value
    onChange(newValue)
    onLogInput?.({
      value: newValue,
      selStart: e.target.selectionStart,
      inputType: e.nativeEvent?.inputType || 'unknown'
    })
  }

  function handleKeyDown(e) {
    // 한글 IME 조합 중 keydown은 e.key가 'Process' 등으로 의미가 없어 리듬 로그에서 제외한다.
    // 일부 브라우저는 compositionstart 이전에 Process keydown을 보내므로 nativeEvent도 함께 확인한다.
    if (isComposingRef.current || e.nativeEvent?.isComposing || e.key === 'Process') return
    let k = 'other'
    if (e.key === 'Backspace' || e.key === 'Delete') k = 'backspace'
    else if (e.key === 'Enter') k = 'enter'
    else if (e.key === ' ') k = 'space'
    else if (e.key.length === 1) k = 'char'
    onLogKeydown?.(k)
  }

  function handleCompositionEnd(e) {
    isComposingRef.current = false
    const el = e.target
    // IME의 마지막 확정값을 별도 스냅샷으로 남긴다. 브라우저마다 마지막 onChange의
    // 순서가 달라 리플레이에서 완성 글자가 빠지는 경우를 방지한다.
    onLogInput?.({
      value: el.value,
      selStart: el.selectionStart,
      inputType: 'insertCompositionText'
    })
    // 타임라인은 keydown 이벤트를 표시하므로, 완성된 한글 한 글자도 일반 문자와
    // 동일한 파란색 입력 막대로 표시한다.
    onLogKeydown?.('char')
  }

  function handlePaste(e) {
    const el = e.target
    const pasted = e.clipboardData?.getData('text/plain') || ''
    const selStart = el.selectionStart
    const selEnd = el.selectionEnd
    const resultingLength = el.value.length - (selEnd - selStart) + pasted.length
    onLogPaste?.({
      text: pasted,
      charCount: pasted.length,
      cursorPos: selStart,
      resultingLength
    })
    // e.preventDefault() 호출하지 않음 — 붙여넣기 자체는 그대로 허용
  }

  const charCount = value.length
  const progressPct = wordLimitGuide ? Math.min(100, Math.round((charCount / wordLimitGuide) * 100)) : 0

  return (
    <div className="flex flex-col h-full">
      <textarea
        value={value}
        onChange={handleChange}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        onCompositionStart={() => { isComposingRef.current = true }}
        onCompositionEnd={handleCompositionEnd}
        disabled={disabled}
        placeholder={placeholder}
        spellCheck={false}
        className="flex-1 w-full min-h-[320px] resize-none rounded-2xl border border-gray-200 bg-white px-5 py-4 text-[15px] leading-relaxed text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 disabled:bg-gray-50 disabled:text-gray-500 transition-colors"
      />
      <div className="flex items-center justify-between mt-2 px-1">
        <div className="flex-1 max-w-xs bg-gray-100 rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full transition-all ${progressPct >= 100 ? 'bg-green-500' : 'bg-blue-500'}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <span className="text-xs text-gray-400 ml-3 flex-shrink-0">
          {charCount}{wordLimitGuide ? ` / ${wordLimitGuide}자` : '자'}
        </span>
      </div>
    </div>
  )
}
