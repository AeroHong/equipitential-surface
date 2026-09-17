import React, { useCallback, useEffect, useRef, useState } from 'react'
import { htmlToPlainText } from '../utils/richText.js'
import { sanitizeAnswerHtml } from '../utils/sanitizeHtml.js'
import { isImageFile, uploadAnswerImage } from '../services/storage.js'
import MathComposerDialog from './MathComposerDialog.jsx'
import { createMathExpression, createMathHtml, decodeMathExpression, prepareMathForStorage, renderMathInElement } from '../utils/mathExpression.js'

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

function putCaretIn(target, atEnd = false) {
  const sel = window.getSelection()
  const range = document.createRange()
  range.selectNodeContents(target)
  range.collapse(!atEnd)
  sel.removeAllRanges()
  sel.addRange(range)
}

/**
 * 서식(굵게/기울임/밑줄/목록) + 이미지 삽입/재배치가 가능한 논술 작성 에디터.
 * contentEditable + execCommand 기반(관리자 지문 에디터인 RichTextEditor.jsx와 같은 방식이지만,
 * 링크·글자색·이미지 크기조절 없이 기본 서식 + 이미지 삽입/위치변경만 지원하는 가벼운 버전).
 *
 * 이미지 위치 변경은 RichTextEditor.jsx의 ⋮⋮ 손잡이(블록 단위 드래그 재배치)를 그대로 이식했다
 * — 이미지가 혼자 문단을 차지하면 그 블록째로, 텍스트 중간에 섞여 있으면 그 문단 전체가
 * 함께 움직인다(원본과 동일한 동작).
 *
 * 값(value)은 이제 순수 텍스트가 아니라 HTML이다 — 글자수/AI 패턴 검사는 htmlToPlainText로
 * 뽑아낸 순수 텍스트 기준으로 한다(utils/richText.js).
 *
 * 붙여넣기는 절대 막지 않는다 — 다만 외부 문서/웹페이지의 낯선 서식이 그대로 섞여 들어오는
 * 것만 막기 위해 텍스트는 평문으로 정규화해서 삽입한다(이미지 파일이 붙여넣어지면 업로드해서
 * 끼워 넣는다 — 스크린샷 붙여넣기 대응).
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
  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(0)
  const [uploadError, setUploadError] = useState('')
  const [mathDialog, setMathDialog] = useState(null) // { expression, mode, node? }
  const savedRangeRef = useRef(null)

  // 블록(문단/이미지 단위) 재배치 — RichTextEditor.jsx의 ⋮⋮ 손잡이와 같은 방식.
  const [hoveredBlock, setHoveredBlock] = useState(null) // { el, rect }
  const [blockDrag, setBlockDrag] = useState(null) // { insertBeforeEl, indicatorTop }

  useEffect(() => {
    const el = editorRef.current
    if (el && value !== el.innerHTML) el.innerHTML = value || ''
    if (el) renderMathInElement(el)
  }, [value])

  function commit(inputType) {
    const el = editorRef.current
    if (!el) return
    // KaTeX의 화면용 내부 DOM은 저장하지 않는다. data-math와 읽기용 짧은 평문만 남겨
    // 자동저장 스냅샷과 리플레이가 작고 안정적인 HTML을 갖게 한다.
    prepareMathForStorage(el)
    const html = sanitizeAnswerHtml(el.innerHTML)
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
    const focusedMath = e.target.closest?.('[data-math]')
    if (focusedMath && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      openExistingMath(focusedMath)
      return
    }
    if (e.key === '#' && !disabled) {
      e.preventDefault()
      openMathDialog()
      return
    }
    let k = 'other'
    if (e.key === 'Backspace' || e.key === 'Delete') k = 'backspace'
    else if (e.key === 'Enter') k = 'enter'
    else if (e.key === ' ') k = 'space'
    else if (e.key.length === 1) k = 'char'
    onLogKeydown?.(k)
  }

  function saveSelection() {
    const sel = window.getSelection()
    const range = sel?.rangeCount && editorRef.current?.contains(sel.getRangeAt(0).startContainer)
      ? sel.getRangeAt(0).cloneRange() : null
    savedRangeRef.current = range
  }

  function openMathDialog() {
    if (disabled) return
    saveSelection()
    setMathDialog({ expression: createMathExpression(), mode: 'inline', node: null })
  }

  function openExistingMath(node) {
    if (disabled) return
    saveSelection()
    setMathDialog({
      expression: decodeMathExpression(node.getAttribute('data-math')),
      mode: node.getAttribute('data-math-mode') === 'block' ? 'block' : 'inline',
      node
    })
  }

  function insertMath(expression, mode) {
    const el = editorRef.current
    if (!el || !mathDialog) return
    const html = createMathHtml(expression, mode)
    if (mathDialog.node?.isConnected) {
      const template = document.createElement('template')
      template.innerHTML = html
      mathDialog.node.replaceWith(template.content.firstChild)
    } else {
      el.focus()
      const sel = window.getSelection()
      if (savedRangeRef.current) { sel.removeAllRanges(); sel.addRange(savedRangeRef.current) }
      document.execCommand('insertHTML', false, html)
    }
    setMathDialog(null)
    commit('insertMath')
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

  const insertImage = useCallback(async (file) => {
    if (disabled) return
    setUploadError('')
    setUploading(n => n + 1)
    try {
      const uploaded = await uploadAnswerImage(file)
      editorRef.current?.focus()
      document.execCommand('insertHTML', false,
        `<img src="${uploaded.url}" alt="${(file.name || '이미지').replace(/"/g, '')}" /><br/>`)
      commit('insertImage')
    } catch (err) {
      setUploadError(err.message || '이미지를 올리지 못했습니다.')
    } finally {
      setUploading(n => n - 1)
    }
  }, [disabled])

  function handlePaste(e) {
    const files = [...(e.clipboardData?.files || [])].filter(isImageFile)
    if (files.length > 0) {
      e.preventDefault()
      files.forEach(insertImage)
      return
    }

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

  function handleDrop(e) {
    const files = [...(e.dataTransfer?.files || [])].filter(isImageFile)
    if (files.length === 0) return
    e.preventDefault()
    files.forEach(insertImage)
  }

  function handleFiles(files) {
    [...files].filter(isImageFile).forEach(insertImage)
  }

  // ── 블록 드래그 재배치(⋮⋮) ────────────────────────────────────────────
  const findTopBlockAtY = useCallback((y) => {
    const el = editorRef.current
    if (!el) return null
    for (const child of el.children) {
      const r = child.getBoundingClientRect()
      if (y < r.top || y > r.bottom) continue
      return child
    }
    return null
  }, [])

  // 손잡이가 편집기 rect 왼쪽 바깥(fixed)에 뜨다 보니 "글자 위 → 손잡이" 이동은 그 사이
  // 몇 px의 빈 공간을 지난다 — 즉시 지우지 않고 180ms 기다렸다가 지운다(그사이 손잡이에
  // 도착하면 취소된다). RichTextEditor.jsx와 같은 이유·같은 방식.
  const hoverClearTimer = useRef(null)
  const cancelHoverClear = () => {
    if (hoverClearTimer.current) { clearTimeout(hoverClearTimer.current); hoverClearTimer.current = null }
  }
  const scheduleHoverClear = () => {
    cancelHoverClear()
    hoverClearTimer.current = setTimeout(() => {
      hoverClearTimer.current = null
      setHoveredBlock(null)
    }, 180)
  }
  useEffect(() => () => cancelHoverClear(), [])

  function handleEditorMouseMove(e) {
    if (disabled || blockDrag) return
    cancelHoverClear()
    if (e.target.closest?.('[data-block-handle]')) return
    const block = findTopBlockAtY(e.clientY)
    if (block) setHoveredBlock(prev => (prev?.el === block ? prev : { el: block, rect: block.getBoundingClientRect() }))
    else scheduleHoverClear()
  }

  function handleEditorClick(e) {
    const math = e.target.closest?.('[data-math]')
    if (math) { e.preventDefault(); openExistingMath(math) }
  }

  function handleEditorMouseLeave() {
    if (!blockDrag) scheduleHoverClear()
  }

  useEffect(() => {
    if (!hoveredBlock) return
    const remeasure = () => {
      setHoveredBlock(prev => (prev?.el?.isConnected ? { el: prev.el, rect: prev.el.getBoundingClientRect() } : null))
    }
    window.addEventListener('resize', remeasure)
    window.addEventListener('scroll', remeasure, true)
    return () => {
      window.removeEventListener('resize', remeasure)
      window.removeEventListener('scroll', remeasure, true)
    }
  }, [hoveredBlock?.el])

  /**
   * 손잡이 pointerdown — 거의 안 움직이면(4px 미만) 클릭으로 보고 캐럿을 그 블록
   * 맨 앞에 둔다. 그 이상 끌면 드래그로 보고 재배치 모드로 들어간다.
   */
  function handleHandlePointerDown(e) {
    e.preventDefault()
    e.stopPropagation()
    const block = hoveredBlock?.el
    const el = editorRef.current
    if (!block || !el) return
    const startX = e.clientX
    const startY = e.clientY
    let moved = false

    function onMove(ev) {
      if (!moved) {
        if (Math.abs(ev.clientX - startX) < 4 && Math.abs(ev.clientY - startY) < 4) return
        moved = true
      }
      const siblings = [...el.children]
      let insertBeforeEl = null
      let indicatorTop = null
      for (const sib of siblings) {
        if (sib === block) continue
        const r = sib.getBoundingClientRect()
        if (ev.clientY < r.top + r.height / 2) { insertBeforeEl = sib; indicatorTop = r.top; break }
      }
      if (indicatorTop === null) {
        const last = siblings[siblings.length - 1]
        indicatorTop = (last === block ? block : last).getBoundingClientRect().bottom
      }
      setBlockDrag({ insertBeforeEl, indicatorTop })
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (moved) {
        setBlockDrag(prev => {
          if (prev) {
            if (prev.insertBeforeEl) el.insertBefore(block, prev.insertBeforeEl)
            else el.appendChild(block)
            commit('moveBlock')
          }
          return null
        })
        setHoveredBlock(null)
      } else {
        putCaretIn(block)
        el.focus()
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
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
        <button
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={openMathDialog}
          disabled={disabled}
          title="수식 삽입 (#)"
          className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          √
        </button>
        <button
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          title="이미지 삽입 (붙여넣기·끌어놓기도 됩니다)"
          className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          🖼
        </button>
        {uploading > 0 && <span className="text-xs text-gray-400 ml-1">이미지 올리는 중…</span>}
        {uploadError && <span className="text-xs text-red-500 ml-1">{uploadError}</span>}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={e => { handleFiles(e.target.files); e.target.value = '' }}
      />

      <div className="relative" onMouseMove={handleEditorMouseMove} onMouseLeave={handleEditorMouseLeave}>
        {!plainText && !/<img\b/i.test(value || '') && (
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
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onKeyDown={handleKeyDown}
          onClick={handleEditorClick}
          onCompositionStart={() => { isComposingRef.current = true }}
          onCompositionEnd={handleCompositionEnd}
          className={`relative min-h-[320px] w-full rounded-2xl border px-5 py-4 text-[15px] leading-relaxed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg ${
            disabled ? 'bg-gray-50 text-gray-500 border-gray-200 cursor-not-allowed' : 'bg-white text-gray-800 border-gray-200'
          }`}
        />

        {/* 블록 손잡이(⋮⋮) — 지금 마우스가 올라간 블록의 왼쪽 바깥에 뜬다. */}
        {hoveredBlock && !disabled && (
          <div
            data-block-handle="true"
            onPointerDown={handleHandlePointerDown}
            onMouseEnter={cancelHoverClear}
            onMouseLeave={scheduleHoverClear}
            style={{
              position: 'fixed',
              top: hoveredBlock.rect.top + 1,
              left: hoveredBlock.rect.left - 26,
              zIndex: 1200
            }}
            className="w-[22px] h-[22px] rounded flex items-center justify-center cursor-grab text-gray-300 hover:bg-gray-100 hover:text-gray-500 select-none text-xs leading-none"
          >
            ⋮⋮
          </div>
        )}

        {/* 드래그로 블록을 끄는 동안 삽입될 자리를 형제 사이 얇은 선으로 보여준다. */}
        {blockDrag && (
          <div
            style={{
              position: 'fixed',
              top: blockDrag.indicatorTop - 1,
              left: editorRef.current?.getBoundingClientRect().left ?? 0,
              width: editorRef.current?.getBoundingClientRect().width ?? 0,
              zIndex: 1300
            }}
            className="h-0.5 bg-blue-500 rounded pointer-events-none"
          />
        )}
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
      {mathDialog && (
        <MathComposerDialog
          initialExpression={mathDialog.expression}
          initialMode={mathDialog.mode}
          onCancel={() => { setMathDialog(null); editorRef.current?.focus() }}
          onConfirm={insertMath}
        />
      )}
    </div>
  )
}
