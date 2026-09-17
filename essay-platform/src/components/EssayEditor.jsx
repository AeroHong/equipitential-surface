import React, { useEffect, useRef } from 'react'
import { htmlToPlainText, sanitizeHtml } from '../utils/richText.js'

const TOOLS = [
  { cmd: 'bold', label: '굵게', glyph: 'B', glyphClass: 'font-bold' },
  { cmd: 'italic', label: '기울임', glyph: 'I', glyphClass: 'italic' },
  { cmd: 'underline', label: '밑줄', glyph: 'U', glyphClass: 'underline' },
  { cmd: 'insertUnorderedList', label: '글머리 기호 목록', glyph: '•' },
  { cmd: 'insertOrderedList', label: '번호 매기기 목록', glyph: '1.' }
]

/**
 * 캐럿(커서) 위치를 편집 영역 시작부터의 순수 텍스트 글자 수로 환산한다 — textarea의
 * selectionStart에 대응하는 contentEditable 버전. contentEditable엔 그런 간단한 속성이
 * 없어 Range API로 "편집 영역 시작 ~ 현재 캐럿까지의 텍스트 길이"를 직접 재야 한다.
 */
function getCaretOffset(root) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || !root) return 0
  const range = sel.getRangeAt(0)
  if (!root.contains(range.startContainer)) return 0
  const preRange = document.createRange()
  preRange.selectNodeContents(root)
  preRange.setEnd(range.startContainer, range.startOffset)
  return preRange.toString().length
}

/**
 * 서식(굵게/기울임/밑줄/목록) 입력이 가능한 논술 작성 에디터.
 * contentEditable + execCommand 기반(관리자 지문 에디터인 RichTextEditor.jsx와 같은 방식이지만,
 * 이미지·링크·색상 없이 기본 서식만 지원하는 가벼운 버전).
 *
 * 값(value)은 이제 순수 텍스트가 아니라 HTML이다 — 글자수/AI 패턴 검사는 htmlToPlainText로
 * 뽑아낸 순수 텍스트 기준으로 한다(utils/richText.js).
 *
 * 붙여넣기는 절대 막지 않는다 — 다만 외부 문서/웹페이지의 낯선 서식이 그대로 섞여 들어오는
 * 것만 막기 위해 평문으로 정규화해서 삽입한다(붙여넣기 이벤트 자체를 취소하는 게 아니라,
 * 원본 서식 대신 이 에디터의 기본 서식 세트로 다시 감싸 넣는 것).
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
  const editorRef = useRef(null)

  useEffect(() => {
    const el = editorRef.current
    if (el && value !== el.innerHTML) el.innerHTML = value || ''
  }, [value])

  function commit(inputType) {
    const el = editorRef.current
    if (!el) return
    const html = sanitizeHtml(el.innerHTML)
    if (html !== el.innerHTML) el.innerHTML = html
    onChange(html)
    onLogInput?.({
      value: html,
      selStart: getCaretOffset(el),
      inputType
    })
  }

  function handleInput(e) {
    commit(e.nativeEvent?.inputType || 'unknown')
  }

  function exec(cmd) {
    if (disabled) return
    editorRef.current?.focus()
    document.execCommand(cmd, false, null)
    commit(cmd)
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

  function handleCompositionEnd() {
    isComposingRef.current = false
    // IME의 마지막 확정값을 별도 스냅샷으로 남긴다. 브라우저마다 마지막 input 이벤트의
    // 순서가 달라 리플레이에서 완성 글자가 빠지는 경우를 방지한다.
    commit('insertCompositionText')
    // 타임라인은 keydown 이벤트를 표시하므로, 완성된 한글 한 글자도 일반 문자와
    // 동일한 파란색 입력 막대로 표시한다.
    onLogKeydown?.('char')
  }

  function handlePaste(e) {
    const el = editorRef.current
    const pasted = e.clipboardData?.getData('text/plain') || ''
    const sel = window.getSelection()
    const selectedLen = sel && !sel.isCollapsed ? sel.toString().length : 0
    const beforeLen = htmlToPlainText(el?.innerHTML).length
    onLogPaste?.({
      text: pasted,
      charCount: pasted.length,
      cursorPos: getCaretOffset(el),
      resultingLength: beforeLen - selectedLen + pasted.length
    })
    e.preventDefault()
    document.execCommand('insertText', false, pasted)
    commit('insertFromPaste')
  }

  const plainText = htmlToPlainText(value)
  const charCount = plainText.length
  const progressPct = wordLimitGuide ? Math.min(100, Math.round((charCount / wordLimitGuide) * 100)) : 0

  return (
    <div className="flex-shrink-0">
      <div className="flex items-center gap-1 mb-1.5">
        {TOOLS.map(tool => (
          <button
            key={tool.cmd}
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={() => exec(tool.cmd)}
            disabled={disabled}
            title={tool.label}
            className={`w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${tool.glyphClass || ''}`}
          >
            {tool.glyph}
          </button>
        ))}
      </div>

      <div className="relative">
        {!plainText && (
          <div className="absolute top-4 left-5 text-[15px] leading-relaxed text-gray-300 pointer-events-none select-none">
            {placeholder}
          </div>
        )}
        <div
          ref={editorRef}
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={handleInput}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => { isComposingRef.current = true }}
          onCompositionEnd={handleCompositionEnd}
          className={`relative min-h-[320px] w-full rounded-2xl border px-5 py-4 text-[15px] leading-relaxed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 ${
            disabled ? 'bg-gray-50 text-gray-500 border-gray-200 cursor-not-allowed' : 'bg-white text-gray-800 border-gray-200'
          }`}
        />
      </div>

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
