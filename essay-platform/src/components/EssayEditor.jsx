import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { htmlToPlainText } from '../utils/richText.js'
import { sanitizeAnswerHtml } from '../utils/sanitizeHtml.js'
import { isImageFile, uploadAnswerImage } from '../services/storage.js'
import { createMathHtml, decodeLatex, decodeMathExpression, insertLineBreakAfterMath, mathToLatex, prepareMathForStorage, renderMathInElement } from '../utils/mathExpression.js'

// mathlive(전용 수식 편집 라이브러리)는 수식 버튼을 처음 누르기 전까지 아예 안 실리도록
// 별도 청크로 lazy load한다 — MathComposerDialog.jsx만 이 패키지를 import한다.
const MathComposerDialog = lazy(() => import('./MathComposerDialog.jsx'))

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
  const [mathDialog, setMathDialog] = useState(null) // { latex, mode, node? }
  const savedRangeRef = useRef(null)

  // 블록(문단/이미지 단위) 재배치 — RichTextEditor.jsx의 ⋮⋮ 손잡이와 같은 방식.
  const [hoveredBlock, setHoveredBlock] = useState(null) // { el, rect }
  const [blockDrag, setBlockDrag] = useState(null) // { insertBeforeEl, indicatorTop }

  // value(저장용 — 수식이 평문 라벨로 접힌 HTML)와 el.innerHTML(화면용 — 수식이 KaTeX로
  // 렌더링된 상태)은 수식이 하나라도 있으면 원래 서로 다르다. "지금 value가 라이브 DOM을
  // 그대로 접은 것과 같은지"를 먼저 확인해서, 같으면(내가 방금 타이핑해서 생긴 echo) 화면을
  // 그대로 두고, 다르면(섹션 전환·최초 로드 등 진짜 외부 변경) 그때만 다시 그린다. 매번
  // 무조건 다시 그리면 타이핑할 때마다 수식이 평문으로 굳어버린 채 안 돌아오는 문제가
  // 생긴다(엔터/스페이스 등 여러 계기로 반복 발견됨) — commit()이 라이브 DOM은 건드리지
  // 않고 별도 복제본에서만 저장용 문자열을 만들기 때문에, 화면은 항상 최신 렌더링을 유지한다.
  function toStorageHtml(el) {
    const clone = el.cloneNode(true)
    prepareMathForStorage(clone)
    return sanitizeAnswerHtml(clone.innerHTML)
  }

  useEffect(() => {
    const el = editorRef.current
    if (!el) return
    if (toStorageHtml(el) !== (value || '')) {
      el.innerHTML = value || ''
      renderMathInElement(el)
    }
  }, [value])

  function commit(inputType) {
    const el = editorRef.current
    if (!el) return
    const html = toStorageHtml(el)
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
    // Chromium은 contenteditable=false 수식 바로 뒤 Enter에서 수식 wrapper를 복제한다.
    // 이 경우만 기본 줄바꿈을 막고, 수식 하나를 유지한 채 새 줄과 캐럿을 직접 만든다.
    if (e.key === 'Enter' && insertLineBreakAfterMath(editorRef.current)) {
      e.preventDefault()
      commit('insertLineBreak')
      onLogKeydown?.('enter')
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
    if (sel?.rangeCount && editorRef.current?.contains(sel.getRangeAt(0).startContainer)) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange()
      return
    }
    // 본문을 한 번도 클릭하지 않은 채(예: 페이지를 열자마자) 툴바의 √ 버튼부터 누르면
    // 살릴 선택 영역이 없다 — 이때 savedRangeRef를 null로 두면 나중에 insertMath가
    // execCommand('insertHTML', ...)를 캐럿 없이 호출하게 되어 조용히 아무 일도 안
    // 일어난다(브라우저가 삽입 지점을 못 찾음). 편집 영역 맨 끝을 기본 삽입 위치로 삼는다.
    const el = editorRef.current
    if (!el) { savedRangeRef.current = null; return }
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    savedRangeRef.current = range
  }

  function openMathDialog() {
    if (disabled) return
    saveSelection()
    setMathDialog({ latex: '', mode: 'inline', node: null })
  }

  /** 노드의 data-math-format을 보고 신규(원본 LaTeX)/레거시(템플릿) 저장 형식을 구분해 읽는다. */
  function readMathLatex(node) {
    return node.getAttribute('data-math-format') === 'tex'
      ? decodeLatex(node.getAttribute('data-math'))
      : mathToLatex(decodeMathExpression(node.getAttribute('data-math')))
  }

  function openExistingMath(node) {
    if (disabled) return
    saveSelection()
    setMathDialog({
      latex: readMathLatex(node),
      mode: node.getAttribute('data-math-mode') === 'block' ? 'block' : 'inline',
      node
    })
  }

  /**
   * 수식 바로 뒤에 zero-width 텍스트 노드를 캐럿 자리로 만들어 둔다. execCommand의 암묵적
   * 캐럿 배치에 기대지 않고 우리가 직접 위치를 보장하면, 캐럿이 "수식 바로 옆(엘리먼트
   * 경계)"이 아니라 "수식 바로 다음의 평범한 텍스트 노드 안"에 있게 되어, 그 상태에서
   * Enter/Space를 눌러도 contenteditable=false 원자 요소 경계에서 브라우저가 벌이는
   * 복제·풀림 같은 특이 동작을 피할 수 있다.
   */
  function placeCaretAfter(node) {
    const caretNode = document.createTextNode('​')
    node.after(caretNode)
    const range = document.createRange()
    range.setStart(caretNode, 1)
    range.collapse(true)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
  }

  function insertMath(latex, mode) {
    const el = editorRef.current
    if (!el || !mathDialog) return
    const html = createMathHtml(latex, mode)
    const template = document.createElement('template')
    template.innerHTML = html
    const mathNode = template.content.firstChild
    if (mathDialog.node?.isConnected) {
      mathDialog.node.replaceWith(mathNode)
    } else {
      el.focus()
      const sel = window.getSelection()
      if (savedRangeRef.current) { sel.removeAllRanges(); sel.addRange(savedRangeRef.current) }
      const range = sel.rangeCount ? sel.getRangeAt(0) : null
      if (range && el.contains(range.startContainer)) {
        range.deleteContents()
        range.insertNode(mathNode)
      } else {
        el.appendChild(mathNode)
      }
    }
    // createMathHtml()이 만드는 초기 마크업은 KaTeX로 그려지기 전의 평문 라벨이다 — 값이
    // 실제로 안 바뀌는(내가 방금 넣은 걸 그대로 되읽는) commit 이후에는 [value] 이펙트가
    // 다시 그리기를 건너뛰므로, 방금 넣거나 고친 수식은 여기서 직접 한 번 그려줘야 한다.
    renderMathInElement(el)
    placeCaretAfter(mathNode)
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
    const html = e.clipboardData?.getData('text/html') || ''
    const pasted = e.clipboardData?.getData('text/plain') || ''
    const sel = window.getSelection()
    const selectedLen = sel && !sel.isCollapsed ? sel.toString().length : 0
    const beforeLen = htmlToPlainText(el?.innerHTML).length

    // 수식(KaTeX)이 포함된 영역을 복사하면 브라우저가 만드는 text/plain에는 화면에 보이지
    // 않는 접근성용 MathML 텍스트까지 섞여 들어와 글자가 뒤섞인 것처럼 보인다("이상한 버그").
    // text/html에 우리 수식 wrapper(data-math)가 있으면 그 인코딩된 식을 그대로 다시 읽어
    // 새 수식 노드로 복원하고, 그 외 텍스트만 평문으로 붙여넣는다.
    if (/\sdata-math=/.test(html)) {
      e.preventDefault()
      pasteWithMath(html)
      return
    }

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

  function pasteWithMath(html) {
    const el = editorRef.current
    if (!el) return
    const container = document.createElement('div')
    container.innerHTML = html
    const frag = document.createDocumentFragment()

    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.textContent) frag.appendChild(document.createTextNode(node.textContent))
        return
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return
      if (node.matches('[data-math]')) {
        // KaTeX가 그려 넣은 마크업을 그대로 복사하지 않고, data-math에 담긴 식을 다시 읽어
        // 깨끗한 수식 노드를 새로 만든다 — 잘려나간 KaTeX 내부 span 조각이 섞여 들어오는 것을 막는다.
        // (레거시 형식이었다면 이 과정에서 자연스럽게 신규 LaTeX 형식으로 바뀐다.)
        const latex = readMathLatex(node)
        const mode = node.getAttribute('data-math-mode') === 'block' ? 'block' : 'inline'
        const template = document.createElement('template')
        template.innerHTML = createMathHtml(latex, mode)
        frag.appendChild(template.content.firstChild)
        return
      }
      if (node.tagName === 'BR') { frag.appendChild(document.createElement('br')); return }
      node.childNodes.forEach(walk)
      if (/^(DIV|P|LI)$/.test(node.tagName)) frag.appendChild(document.createTextNode('\n'))
    }
    container.childNodes.forEach(walk)

    const lastNode = frag.lastChild
    const sel = window.getSelection()
    const range = sel?.rangeCount ? sel.getRangeAt(0) : null
    if (range && el.contains(range.startContainer)) {
      range.deleteContents()
      range.insertNode(frag)
    } else {
      el.appendChild(frag)
    }

    renderMathInElement(el)
    if (lastNode?.nodeType === Node.ELEMENT_NODE && lastNode.matches('[data-math]')) {
      placeCaretAfter(lastNode)
    } else if (lastNode) {
      const r = document.createRange()
      r.setStart(lastNode, lastNode.textContent?.length || 0)
      r.collapse(true)
      sel.removeAllRanges()
      sel.addRange(r)
    }
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
        <Suspense fallback={
          <div className="fixed inset-0 z-[1400] flex items-center justify-center bg-slate-900/35">
            <div className="rounded-xl bg-white px-4 py-3 text-sm text-slate-500 shadow-lg">수식 입력창 불러오는 중…</div>
          </div>
        }>
          <MathComposerDialog
            initialLatex={mathDialog.latex}
            initialMode={mathDialog.mode}
            onCancel={() => { setMathDialog(null); editorRef.current?.focus() }}
            onConfirm={insertMath}
          />
        </Suspense>
      )}
    </div>
  )
}
