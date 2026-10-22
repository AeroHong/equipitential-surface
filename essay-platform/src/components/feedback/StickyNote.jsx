import React, { Suspense, forwardRef, lazy, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import katex from 'katex'
import { FEEDBACK_COLORS } from '../../services/feedback.js'

// 학생 편집기와 같은 수식 입력창(mathlive) — 수식 버튼을 처음 누를 때만 불러온다.
const MathComposerDialog = lazy(() => import('../MathComposerDialog.jsx'))

// miro 스티키 노트 느낌 — 파스텔 종이색, 부드러운 그림자, 노트마다 살짝 다른 기울기.
// 색 키는 services/feedback.js FEEDBACK_COLORS, 형광펜 색은 index.css .fb-mark와 맞춘다.
export const NOTE_STYLES = {
  yellow: { paper: '#FFF6A5', pin: '#e0b400' },
  pink: { paper: '#FFD6E5', pin: '#e85a8f' },
  blue: { paper: '#D3ECFF', pin: '#3b8fe0' },
  green: { paper: '#DAF5CF', pin: '#4fa846' },
  purple: { paper: '#E8DDFF', pin: '#8a5cf0' }
}

function noteStyle(color) {
  return NOTE_STYLES[color] || NOTE_STYLES.yellow
}

/** id로 정해지는 -1.5°~1.5° 기울기 — 다시 그려도 같은 노트는 같은 각도 */
function tiltOf(id) {
  let h = 0
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) | 0
  return ((Math.abs(h) % 31) - 15) / 10
}

function formatTime(ms) {
  if (!ms) return ''
  const d = new Date(ms)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 노트 글의 $…$(문장 안)·$$…$$(한 줄) 구간을 KaTeX로 그린다. 나머지는 그냥 글자. */
function NoteText({ text }) {
  const parts = []
  const re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g
  let last = 0
  let m
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const block = m[1] != null
    const html = katex.renderToString(block ? m[1] : m[2], { throwOnError: false, displayMode: block })
    parts.push(<span key={m.index} className={block ? 'block overflow-x-auto' : ''} dangerouslySetInnerHTML={{ __html: html }} />)
    last = re.lastIndex
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

/** 핀(그림·표·수식 위 번호 동그라미)과 노트 번호 배지 공용 */
export function NoteBadge({ num, color, className = '', ...rest }) {
  return (
    <span
      className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[11px] font-bold leading-none text-white shadow ${className}`}
      style={{ background: noteStyle(color).pin }}
      {...rest}
    >
      {num}
    </span>
  )
}

/**
 * @param {{note:object, num:number, editable:boolean, editing:boolean, active:boolean, missing?:boolean,
 *   onStartEdit?:()=>void, onSave?:(patch:object)=>void, onDelete?:()=>void, onHover?:(on:boolean)=>void,
 *   dragging?:boolean, onDragStart?:(e:PointerEvent)=>void, onResizeStart?:(e:PointerEvent)=>void,
 *   onResetLayout?:()=>void, style?:object}} props
 */
const StickyNote = forwardRef(function StickyNote(
  {
    note, num, editable, editing, active, missing, onStartEdit, onSave, onDelete, onHover,
    dragging, onDragStart, onResizeStart, onResetLayout, style
  },
  ref
) {
  const { paper } = noteStyle(note.color)
  const [draft, setDraft] = useState(note.text || '')
  const textareaRef = useRef(null)
  const [mathOpen, setMathOpen] = useState(false)
  const caretRef = useRef(null) // 수식 창을 열 때의 커서 위치

  useEffect(() => { if (!editing) setDraft(note.text || '') }, [note.text, editing])
  useEffect(() => {
    if (!editing || !textareaRef.current) return
    const ta = textareaRef.current
    // preventScroll: 새 노트는 첫 배치 전 잠깐 여백 맨 위에 그려진다 — 그대로 focus하면 화면이 답안 맨
    // 위로 튄다. 배치가 끝난 다음 프레임에 노트가 화면 밖일 때만 살짝 스크롤한다.
    ta.focus({ preventScroll: true })
    const frame = requestAnimationFrame(() => ta.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }))
    ta.setSelectionRange(ta.value.length, ta.value.length)
    return () => cancelAnimationFrame(frame)
  }, [editing])

  // 입력에 맞춰 높이를 늘린다(스크롤바 없는 종이 느낌).
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${ta.scrollHeight}px`
  }, [draft, editing])

  function commit() {
    const text = draft.trim()
    if (text !== (note.text || '')) onSave?.({ text })
    else onSave?.({})
  }

  function openMath() {
    const ta = textareaRef.current
    caretRef.current = ta ? [ta.selectionStart, ta.selectionEnd] : [draft.length, draft.length]
    setMathOpen(true)
  }

  function insertMath(latex, mode) {
    setMathOpen(false)
    const [s, e] = caretRef.current || [draft.length, draft.length]
    const tex = latex.trim()
    const piece = tex ? (mode === 'block' ? `$$${tex}$$` : `$${tex}$`) : ''
    setDraft(draft.slice(0, s) + piece + draft.slice(e))
    requestAnimationFrame(() => {
      const ta = textareaRef.current
      if (!ta) return
      ta.focus({ preventScroll: true })
      ta.setSelectionRange(s + piece.length, s + piece.length)
    })
  }

  function closeMath() {
    setMathOpen(false)
    requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }))
  }

  return (
    <div
      ref={ref}
      data-note-card={note.id}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      className={`group relative rounded-[3px] px-3 pb-2 pt-2.5 text-[13px] leading-snug text-gray-800 transition-[transform,box-shadow] duration-150 ${dragging ? 'select-none' : ''}`}
      style={{
        background: paper,
        transform: `rotate(${editing || active || dragging ? 0 : tiltOf(note.id)}deg) translateY(${active || dragging ? -2 : 0}px)`,
        boxShadow: dragging
          ? '0 18px 36px -10px rgba(0,0,0,.35), 0 4px 10px rgba(0,0,0,.1)'
          : active || editing
            ? '0 10px 24px -8px rgba(0,0,0,.28), 0 2px 6px rgba(0,0,0,.08)'
            : '0 6px 14px -8px rgba(0,0,0,.25), 0 1px 3px rgba(0,0,0,.06)',
        ...style
      }}
    >
      {/* 윗줄이 손잡이 — 잡고 끌면 노트를 옮긴다(버튼 위에서 누른 건 제외). */}
      <div
        className={`mb-1 flex items-center gap-1.5 ${onDragStart ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : ''}`}
        style={onDragStart ? { touchAction: 'none' } : undefined}
        onPointerDown={onDragStart ? e => { if (!e.target.closest('button')) onDragStart(e) } : undefined}
        title={onDragStart ? '끌어서 옮기기' : undefined}
      >
        <NoteBadge num={num} color={note.color} />
        {missing && <span className="text-[10px] text-gray-500">원래 위치를 찾을 수 없음</span>}
        {onResetLayout && (
          <button
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={onResetLayout}
            className={`ml-auto rounded px-1 text-xs text-gray-500 opacity-0 transition-opacity hover:bg-black/5 hover:text-gray-800 group-hover:opacity-100`}
            title="원래 자리·크기로"
          >
            ↺
          </button>
        )}
        {editable && !editing && (
          <button
            type="button"
            onClick={onDelete}
            className={`${onResetLayout ? '' : 'ml-auto'} rounded px-1 text-xs text-gray-500 opacity-0 transition-opacity hover:bg-black/5 hover:text-gray-800 group-hover:opacity-100`}
            title="삭제"
          >
            ✕
          </button>
        )}
      </div>

      {editing ? (
        <>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); commit() }
            }}
            onBlur={e => {
              // 색 고르는 버튼·수식 창으로 포커스가 옮겨가는 건 편집 종료가 아니다.
              if (mathOpen) return
              if (e.relatedTarget?.closest?.(`[data-note-card="${note.id}"]`)) return
              commit()
            }}
            placeholder="피드백을 적어주세요 (수식: ∑ 버튼 또는 $x^2$)"
            rows={2}
            className="block w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-[13px] leading-snug text-gray-800 placeholder:text-gray-500/70 focus:outline-none focus:ring-0"
          />
          <div className="mt-2 flex items-center gap-1.5">
            <button
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={openMath}
              className="mr-1 rounded border border-black/10 bg-white/60 px-1.5 text-[11px] font-semibold leading-4 text-gray-700 hover:bg-white"
              title="수식 넣기"
            >
              ∑
            </button>
            {FEEDBACK_COLORS.map(c => (
              <button
                key={c}
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => onSave?.({ color: c, keepEditing: true })}
                className={`h-4 w-4 rounded-full border transition-transform hover:scale-110 ${note.color === c ? 'border-gray-700 ring-1 ring-gray-700' : 'border-black/10'}`}
                style={{ background: NOTE_STYLES[c].paper }}
                title={c}
              />
            ))}
            <span className="ml-auto text-[10px] text-gray-500">Ctrl+Enter 완료</span>
          </div>
          {/* 노트는 transform(기울기)이 있어 fixed 창이 노트 안에 갇힌다 — body로 띄운다. */}
          {mathOpen && createPortal(
            <Suspense fallback={null}>
              <MathComposerDialog initialLatex="" initialMode="inline" onCancel={closeMath} onConfirm={insertMath} />
            </Suspense>,
            document.body
          )}
        </>
      ) : (
        <div
          onClick={editable ? onStartEdit : undefined}
          className={`whitespace-pre-wrap break-words ${editable ? 'cursor-text' : ''}`}
        >
          {note.text ? <NoteText text={note.text} /> : <span className="text-gray-500/70">(내용 없음)</span>}
        </div>
      )}

      {!editing && note.updatedAt && (
        <div className="mt-1.5 text-right text-[10px] text-gray-500/80">{formatTime(note.updatedAt)}</div>
      )}

      {onResizeStart && (
        <div
          onPointerDown={onResizeStart}
          className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize opacity-0 transition-opacity group-hover:opacity-100"
          style={{ touchAction: 'none', background: 'linear-gradient(135deg, transparent 50%, rgba(0,0,0,.18) 50%, rgba(0,0,0,.18) 60%, transparent 60%, transparent 72%, rgba(0,0,0,.18) 72%, rgba(0,0,0,.18) 82%, transparent 82%)' }}
          title="끌어서 크기 조절"
        />
      )}
    </div>
  )
})

export default StickyNote
