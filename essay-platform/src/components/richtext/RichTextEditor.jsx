/**
 * 본문 편집기 — smart-teachers-office(apps/dashboard/src/components/RichTextEditor.jsx)에서 이식.
 *
 * contentEditable + execCommand 기반(에디터 라이브러리 없음, 원본 주석의 번들 크기 이유 그대로 유효).
 * 원본과 다른 부분은 이미지 업로드뿐이다 — schoolId 기반 다중 테넌트 경로(uploadAttachment) 대신
 * essay-platform 자체 업로드 함수(uploadPassageImage, essayPassages/{uid}/...)를 쓴다.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import FormatBoldIcon from '@mui/icons-material/FormatBold'
import FormatItalicIcon from '@mui/icons-material/FormatItalic'
import FormatUnderlinedIcon from '@mui/icons-material/FormatUnderlined'
import StrikethroughSIcon from '@mui/icons-material/StrikethroughS'
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted'
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered'
import LinkIcon from '@mui/icons-material/Link'
import ImageIcon from '@mui/icons-material/Image'
import FormatColorTextIcon from '@mui/icons-material/FormatColorText'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import Popover from '@mui/material/Popover'
import SlashMenu from './SlashMenu.jsx'
import { isImageFile, uploadPassageImage } from '../../services/storage.js'
import { useToast } from './ToastProvider.jsx'
import { RICH_TEXT_SX } from './richTextStyles.js'

const TEXT_COLORS = [
  { label: '기본', value: '#1f2937' },
  { label: '빨강 (중요)', value: '#d32f2f' },
  { label: '주황 (주의)', value: '#e65100' },
  { label: '파랑 (참고)', value: '#1565c0' },
  { label: '초록 (완료)', value: '#2e7d32' },
  { label: '회색 (보조)', value: '#6b7280' }
]

const TOOLS = [
  { cmd: 'bold', label: '굵게 (⌘B)', Icon: FormatBoldIcon },
  { cmd: 'italic', label: '기울임 (⌘I)', Icon: FormatItalicIcon },
  { cmd: 'underline', label: '밑줄 (⌘U)', Icon: FormatUnderlinedIcon },
  { cmd: 'strikeThrough', label: '취소선', Icon: StrikethroughSIcon },
  { divider: true },
  { cmd: 'insertUnorderedList', label: '글머리 기호', Icon: FormatListBulletedIcon },
  { cmd: 'insertOrderedList', label: '번호 매기기', Icon: FormatListNumberedIcon }
]

export default function RichTextEditor({ value, onChange, onImageUploaded, placeholder }) {
  const toast = useToast()
  const editorRef = useRef(null)
  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(0)
  const [colorAnchor, setColorAnchor] = useState(null)
  const [picked, setPicked] = useState(null)
  const [slash, setSlash] = useState(null)
  const [menuRect, setMenuRect] = useState(null)
  const [linkPopover, setLinkPopover] = useState(null)
  const savedRangeRef = useRef(null)
  // 블록(문단 단위) 재배치 — smart-teachers-office CanvasEditor.jsx의 ⋮⋮ 손잡이를 이식.
  // 이 에디터엔 콜아웃/인용문 "안에 넣기" 같은 중첩 컨테이너가 없어 그 부분은 뺐다 —
  // 편집기 바로 아래 형제 블록끼리 순서만 바꾼다.
  const [hoveredBlock, setHoveredBlock] = useState(null)   // { el, rect }
  const [blockDrag, setBlockDrag] = useState(null)   // { insertBeforeEl, indicatorTop }

  useEffect(() => {
    const el = editorRef.current
    if (el && value !== el.innerHTML) el.innerHTML = value || ''
  }, [value])

  const emit = useCallback(() => {
    onChange(editorRef.current?.innerHTML || '')
  }, [onChange])

  const handleInput = () => { emit(); syncSlash(); measure(); setMenuRect(null) }

  const clipRect = useCallback(() => editorRef.current?.getBoundingClientRect() || null, [])

  const measure = useCallback(() => {
    setPicked(prev => {
      if (!prev?.el?.isConnected) return null
      return { el: prev.el, rect: prev.el.getBoundingClientRect(), clip: clipRect() }
    })
  }, [clipRect])

  const pickImage = (img) => {
    setPicked({ el: img, rect: img.getBoundingClientRect(), clip: clipRect() })
  }

  const handleEditorClick = (e) => {
    if (e.target?.tagName === 'IMG') {
      pickImage(e.target)
    } else {
      setPicked(null)
      syncSlash()
    }
  }

  useEffect(() => {
    if (!picked) return
    const el = editorRef.current
    window.addEventListener('resize', measure)
    el?.addEventListener('scroll', measure)
    return () => {
      window.removeEventListener('resize', measure)
      el?.removeEventListener('scroll', measure)
    }
  }, [picked, measure])

  /** 마우스 y좌표가 어느 직계 자식(블록) 세로 범위 안에 있는지 찾는다. */
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
  // 도착하면 취소된다). CanvasEditor.jsx와 같은 이유·같은 방식.
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

  const handleEditorMouseMove = (e) => {
    if (blockDrag) return   // 드래그 중엔 onMove가 따로 관리한다
    cancelHoverClear()
    // 손잡이 자체는 편집기 밖(바깥 칸의 형제)이라 findTopBlockAtY가 못 찾는다 — 손잡이
    // 위에서는 지금 상태를 그대로 둔다(안 그러면 손잡이가 깜빡이며 사라진다).
    if (e.target.closest?.('[data-block-handle]')) return
    const block = findTopBlockAtY(e.clientY)
    if (block) setHoveredBlock(prev => (prev?.el === block ? prev : { el: block, rect: block.getBoundingClientRect() }))
    else scheduleHoverClear()
  }

  const handleEditorMouseLeave = () => {
    if (!blockDrag) scheduleHoverClear()
  }

  // 손잡이가 떠 있는 동안 스크롤·창 크기 변화에 다시 잰다 — picked(이미지 손잡이)와 같은 이유.
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
  const handleHandlePointerDown = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const block = hoveredBlock?.el
    const el = editorRef.current
    if (!block || !el) return
    const startX = e.clientX
    const startY = e.clientY
    let moved = false

    const onMove = (ev) => {
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
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (moved) {
        setBlockDrag(prev => {
          if (prev) {
            if (prev.insertBeforeEl) el.insertBefore(block, prev.insertBeforeEl)
            else el.appendChild(block)
            emit()
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

  const startResize = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const img = picked?.el
    if (!img) return

    const startX = e.clientX
    const startWidth = img.getBoundingClientRect().width
    const maxWidth = editorRef.current?.clientWidth || 900

    const onMove = (ev) => {
      const next = Math.round(Math.min(maxWidth, Math.max(80, startWidth + (ev.clientX - startX))))
      img.setAttribute('width', String(next))
      img.style.width = ''
      measure()
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      emit()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const setImageWidth = (ratio) => {
    const img = picked?.el
    if (!img) return
    const box = editorRef.current?.clientWidth || 900
    if (ratio === null) img.removeAttribute('width')
    else img.setAttribute('width', String(Math.round(box * ratio)))
    img.style.width = ''
    measure()
    emit()
  }

  const exec = (cmd, value = null) => {
    editorRef.current?.focus()
    document.execCommand(cmd, false, value)
    emit()
  }

  const readSlashQuery = () => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null
    const node = sel.anchorNode
    if (!node || node.nodeType !== Node.TEXT_NODE) return null
    const before = node.textContent.slice(0, sel.anchorOffset)
    const m = /(?:^|\s)\/([^\s/]*)$/.exec(before)
    if (!m) return null
    return { query: m[1], length: m[1].length + 1 }
  }

  const syncSlash = () => {
    const found = readSlashQuery()
    if (!found) return setSlash(null)
    const rect = window.getSelection().getRangeAt(0).getBoundingClientRect()
    setSlash({
      query: found.query,
      length: found.length,
      rect: rect.width || rect.height ? rect : editorRef.current.getBoundingClientRect()
    })
  }

  const LINE_BLOCKS = 'p,h1,h2,h3,h4,div,li,blockquote,pre'
  const LIST_TAGS = { insertUnorderedList: 'UL', insertOrderedList: 'OL' }

  const readLine = () => {
    const el = editorRef.current
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return null

    const node = sel.anchorNode
    const host = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node
    const block = host && host !== el ? host.closest(LINE_BLOCKS) : null
    const text = block ? block.textContent : (node?.textContent || '')
    return { sel, block, isEmpty: !text.trim() }
  }

  const placeAtEmptyLine = (block, nodes) => {
    const el = editorRef.current
    const sel = window.getSelection()

    if (block?.tagName === 'LI') {
      const list = block.parentElement
      block.remove()
      list.after(nodes)
      if (!list.childElementCount) list.remove()
    } else if (block && block !== el) {
      block.replaceWith(nodes)
    } else {
      sel.getRangeAt(0).insertNode(nodes)
    }
  }

  const putCaretIn = (target, atEnd = false) => {
    const sel = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(target)
    range.collapse(!atEnd)
    sel.removeAllRanges()
    sel.addRange(range)
  }

  const applyHtml = (html) => {
    const line = readLine()
    if (!line) return

    const template = document.createElement('template')
    template.innerHTML = html
    const blocks = [...template.content.children]
    const last = blocks[blocks.length - 1]

    if (!line.isEmpty) {
      const sel = window.getSelection()
      if (sel && !sel.isCollapsed) sel.collapseToEnd()
      document.execCommand('insertHTML', false, html)
      return
    }

    placeAtEmptyLine(line.block, template.content)
    if (last) putCaretIn(last)
  }

  const applyList = (cmd) => {
    const line = readLine()
    if (!line) return

    if (!line.isEmpty) {
      document.execCommand(cmd, false, null)
      return
    }

    const list = document.createElement(LIST_TAGS[cmd])
    const item = document.createElement('li')
    item.appendChild(document.createElement('br'))
    list.appendChild(item)

    placeAtEmptyLine(line.block, list)
    putCaretIn(item)
  }

  const applyBlock = (tag) => {
    const line = readLine()
    if (!line) return

    if (!line.isEmpty) {
      document.execCommand('formatBlock', false, tag)
      return
    }

    const created = document.createElement(tag)
    created.appendChild(document.createElement('br'))

    placeAtEmptyLine(line.block, created)
    putCaretIn(created)
  }

  const EXIT_ON_ENTER = 'h1,h2,h3,h4,blockquote'

  const handleKeyDown = (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return

    const line = readLine()
    const block = line?.block?.closest(EXIT_ON_ENTER)
    if (!block) return

    const sel = window.getSelection()
    const rest = document.createRange()
    rest.selectNodeContents(block)
    rest.setStart(sel.anchorNode, sel.anchorOffset)
    if (rest.toString().trim()) return

    const paragraph = document.createElement('p')
    paragraph.appendChild(document.createElement('br'))
    block.after(paragraph)
    putCaretIn(paragraph)
    e.preventDefault()
    emit()
  }

  const applySlash = (item) => {
    const el = editorRef.current
    el?.focus()

    const found = readSlashQuery()
    if (found) {
      const sel = window.getSelection()
      const range = document.createRange()
      range.setStart(sel.anchorNode, Math.max(0, sel.anchorOffset - found.length))
      range.setEnd(sel.anchorNode, sel.anchorOffset)
      range.deleteContents()
      sel.removeAllRanges()
      sel.addRange(range)
    }
    setSlash(null)
    setMenuRect(null)

    if (item.action === 'image') { fileInputRef.current?.click(); return }
    if (item.cmd) {
      if (LIST_TAGS[item.cmd]) applyList(item.cmd)
      else document.execCommand(item.cmd, false, null)
    }
    else if (item.block) applyBlock(item.block)
    else if (item.html) applyHtml(item.html)
    emit()
  }

  const handleContextMenu = (e) => {
    e.preventDefault()
    setSlash(null)
    setMenuRect({ top: e.clientY, bottom: e.clientY, left: e.clientX, right: e.clientX, width: 0, height: 0 })
  }

  useEffect(() => {
    if (!menuRect) return
    const close = () => setMenuRect(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menuRect])

  const insertImage = useCallback(async (file) => {
    setUploading(n => n + 1)
    try {
      const uploaded = await uploadPassageImage(file)
      editorRef.current?.focus()
      document.execCommand('insertHTML', false,
        `<img src="${uploaded.url}" alt="${(file.name || '이미지').replace(/"/g, '')}" /><br/>`)
      emit()
      onImageUploaded?.(uploaded)
    } catch (e) {
      toast.error(`이미지를 올리지 못했습니다: ${e.message}`, e)
    } finally {
      setUploading(n => n - 1)
    }
  }, [emit, onImageUploaded, toast])

  const handleFiles = (files) => {
    [...files].filter(isImageFile).forEach(insertImage)
  }

  const handlePaste = (e) => {
    const files = [...(e.clipboardData?.files || [])].filter(isImageFile)
    if (files.length > 0) {
      e.preventDefault()
      files.forEach(insertImage)
      return
    }
    e.preventDefault()
    const text = e.clipboardData?.getData('text/plain') || ''
    document.execCommand('insertText', false, text)
    emit()
  }

  const handleDrop = (e) => {
    const files = [...(e.dataTransfer?.files || [])].filter(isImageFile)
    if (files.length === 0) return
    e.preventDefault()
    files.forEach(insertImage)
  }

  const openLinkPopover = () => {
    const sel = window.getSelection()
    const range = sel?.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null
    savedRangeRef.current = range
    const rect = range?.getBoundingClientRect() || editorRef.current?.getBoundingClientRect()
    setLinkPopover({ rect, url: 'https://' })
  }

  const confirmLinkPopover = () => {
    const raw = (linkPopover?.url || '').trim()
    if (!raw || raw === 'https://') { setLinkPopover(null); return }
    const safe = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    editorRef.current?.focus()
    const sel = window.getSelection()
    if (savedRangeRef.current) {
      sel.removeAllRanges()
      sel.addRange(savedRangeRef.current)
    }
    document.execCommand('createLink', false, safe)
    setLinkPopover(null)
    emit()
  }

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 0.2, flexWrap: 'wrap',
        px: 0.6, py: 0.35, borderBottom: '1px solid', borderColor: 'divider',
        bgcolor: 'background.default'
      }}>
        {TOOLS.map((tool, i) => tool.divider ? (
          <Divider key={`d${i}`} orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.6 }} />
        ) : (
          <Tooltip key={tool.cmd} title={tool.label}>
            <IconButton size="small" onMouseDown={e => e.preventDefault()} onClick={() => exec(tool.cmd)}>
              <tool.Icon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        ))}
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.6 }} />
        <Tooltip title="글자색">
          <IconButton size="small" onMouseDown={e => e.preventDefault()} onClick={e => setColorAnchor(e.currentTarget)}>
            <FormatColorTextIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="링크">
          <IconButton size="small" onMouseDown={e => e.preventDefault()} onClick={openLinkPopover}>
            <LinkIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="이미지 (붙여넣기·끌어놓기도 됩니다)">
          <IconButton size="small" onMouseDown={e => e.preventDefault()} onClick={() => fileInputRef.current?.click()}>
            <ImageIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        {uploading > 0 && (
          <Typography fontSize="0.75rem" color="text.secondary" sx={{ ml: 0.5 }}>
            이미지 {uploading}개 올리는 중…
          </Typography>
        )}
      </Box>

      {/* onMouseMove/onMouseLeave는 편집기가 아니라 이 바깥 칸에 건다 — 손잡이(⋮⋮)가
          편집기 rect 왼쪽 바깥에 fixed로 뜨는데, 편집기에 리스너를 달면 마우스가 글자
          위에서 손잡이 쪽으로 움직이는 순간 편집기의 mouseleave가 먼저 터져 손잡이가
          나타나기 전에 사라진다. 손잡이는 이 바깥 칸의 자식(DOM상)이라, 여기 걸면
          "편집기 → 손잡이" 이동은 이 칸 안에서의 이동일 뿐이라 leave가 안 터진다.
          (CanvasEditor.jsx와 같은 이유·같은 방식) */}
      <Box sx={{ position: 'relative' }} onMouseMove={handleEditorMouseMove} onMouseLeave={handleEditorMouseLeave}>
        <Box
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onBlur={emit}
          onKeyDown={handleKeyDown}
          onKeyUp={syncSlash}
          onClick={handleEditorClick}
          onContextMenu={handleContextMenu}
          onCompositionEnd={syncSlash}
          onPaste={handlePaste}
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          data-placeholder={placeholder}
          sx={{
            minHeight: 260, maxHeight: '46vh', overflowY: 'auto',
            px: 1.5, py: 1.2, fontSize: '0.93rem', lineHeight: 1.7,
            outline: 'none',
            '&:empty::before': {
              content: 'attr(data-placeholder)',
              color: 'text.disabled'
            },
            ...RICH_TEXT_SX
          }}
        />

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={e => { handleFiles(e.target.files); e.target.value = '' }}
        />

        {/* 블록 손잡이(⋮⋮) — 지금 마우스가 올라간 블록의 왼쪽 바깥에 뜬다. 이미지가 혼자
            문단(블록)을 차지하고 있으면 이 손잡이로 그 블록째로 위아래 옮길 수 있다 —
            텍스트 중간에 섞인 이미지는 그 문단 전체가 같이 움직인다. */}
        {hoveredBlock && !menuRect && !slash && (
          <Box
            data-block-handle="true"
            onPointerDown={handleHandlePointerDown}
            onMouseEnter={cancelHoverClear}
            onMouseLeave={scheduleHoverClear}
            sx={{
              position: 'fixed',
              top: hoveredBlock.rect.top + 1,
              left: hoveredBlock.rect.left - 26,
              zIndex: 1200, width: 22, height: 22, borderRadius: 0.75,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'grab', color: 'text.disabled',
              '&:hover': { bgcolor: 'action.hover', color: 'text.secondary' }
            }}
          >
            <DragIndicatorIcon sx={{ fontSize: 17 }} />
          </Box>
        )}

        {/* 드래그로 블록을 끄는 동안 삽입될 자리를 형제 사이 얇은 선으로 보여준다. */}
        {blockDrag && (
          <Box sx={{
            position: 'fixed', top: blockDrag.indicatorTop - 1,
            left: editorRef.current?.getBoundingClientRect().left ?? 0,
            width: editorRef.current?.getBoundingClientRect().width ?? 0,
            height: 2, bgcolor: 'primary.main', zIndex: 1300, pointerEvents: 'none',
            borderRadius: 1
          }} />
        )}
      </Box>

      <Popover
        open={!!colorAnchor}
        anchorEl={colorAnchor}
        onClose={() => setColorAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ p: 0.5 }}>
          {TEXT_COLORS.map(c => (
            <Box
              key={c.value}
              onMouseDown={e => e.preventDefault()}
              onClick={() => { exec('foreColor', c.value); setColorAnchor(null) }}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1,
                px: 1.2, py: 0.6, cursor: 'pointer', borderRadius: 0.75,
                '&:hover': { bgcolor: 'action.hover' }
              }}
            >
              <Box sx={{ width: 14, height: 14, borderRadius: '50%', bgcolor: c.value, flexShrink: 0 }} />
              <Typography fontSize="0.83rem">{c.label}</Typography>
            </Box>
          ))}
        </Box>
      </Popover>

      <Popover
        open={!!linkPopover}
        anchorReference="anchorPosition"
        anchorPosition={linkPopover ? { top: linkPopover.rect.bottom, left: linkPopover.rect.left } : undefined}
        onClose={() => setLinkPopover(null)}
      >
        <Box sx={{ p: 1.2, display: 'flex', gap: 0.8, alignItems: 'center' }}>
          <TextField
            size="small" autoFocus placeholder="https://..."
            value={linkPopover?.url || ''}
            onChange={e => setLinkPopover(p => ({ ...p, url: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmLinkPopover() } }}
          />
          <Button size="small" variant="contained" onClick={confirmLinkPopover}>
            링크 추가
          </Button>
        </Box>
      </Popover>

      {picked?.clip && (
        <Box sx={{
          position: 'fixed',
          top: picked.clip.top, left: picked.clip.left,
          width: picked.clip.width, height: picked.clip.height,
          overflow: 'hidden', pointerEvents: 'none', zIndex: 1300
        }}>
          <Box sx={{
            position: 'absolute',
            top: picked.rect.top - picked.clip.top,
            left: picked.rect.left - picked.clip.left,
            width: picked.rect.width, height: picked.rect.height,
            border: '2px solid', borderColor: 'primary.main', borderRadius: 1
          }} />
          <Box
            onPointerDown={startResize}
            sx={{
              position: 'absolute',
              top: picked.rect.bottom - picked.clip.top - 7,
              left: picked.rect.right - picked.clip.left - 7,
              width: 14, height: 14, borderRadius: '50%',
              bgcolor: 'primary.main', border: '2px solid #fff',
              cursor: 'nwse-resize', pointerEvents: 'auto'
            }}
          />
          <Box sx={{
            position: 'absolute',
            top: Math.max(4, picked.rect.top - picked.clip.top - 34),
            left: picked.rect.left - picked.clip.left + 4,
            display: 'flex', gap: 0.3, p: 0.3, borderRadius: 1,
            bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider',
            boxShadow: 2, pointerEvents: 'auto'
          }}>
            {[['작게', 0.3], ['보통', 0.6], ['넓게', 1], ['원본', null]].map(([label, ratio]) => (
              <Box
                key={label}
                onMouseDown={e => { e.preventDefault(); setImageWidth(ratio) }}
                sx={{
                  px: 0.9, py: 0.3, fontSize: '0.75rem', fontWeight: 600,
                  cursor: 'pointer', borderRadius: 0.75,
                  '&:hover': { bgcolor: 'action.hover' }
                }}
              >
                {label}
              </Box>
            ))}
          </Box>
        </Box>
      )}

      <SlashMenu
        open={!!slash || !!menuRect}
        anchorRect={slash?.rect || menuRect}
        query={slash?.query}
        onSelect={applySlash}
        onClose={() => { setSlash(null); setMenuRect(null) }}
      />
    </Box>
  )
}
