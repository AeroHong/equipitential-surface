import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { sanitizeAnswerHtml, sanitizePassageHtml } from '../../utils/sanitizeHtml.js'
import { renderMathInElement } from '../../utils/mathExpression.js'
import {
  applyHighlights, clearHighlights, elementAnchorFromPoint, locateTextAnchor,
  resolveElementAnchor, textAnchorFromRange
} from '../../utils/feedbackAnchors.js'
import ExperimentReport from '../experiment/ExperimentReport.jsx'
import StickyNote, { NoteBadge } from './StickyNote.jsx'

export const ANSWER_HTML_CLASS = 'text-[15px] leading-relaxed text-gray-800 whitespace-pre-wrap [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_table]:table-fixed [&_table]:mx-auto [&_table]:max-w-full [&_table]:border-collapse [&_table]:my-2 [&_td]:border [&_td]:border-gray-300 [&_td]:p-1.5 [&_td]:align-top [&_a]:text-indigo-600 [&_a]:underline'

// 자유서술(essay)은 섹션이 없다 — 노트의 sectionId는 null, 화면 안에서는 이 키로 다룬다.
const TEXT_KEY = '__text__'
// 이 폭보다 넓으면 오른쪽 여백에 노트를 띄우고, 좁으면(휴대폰 등) 섹션 아래에 목록으로 보여준다.
const MARGIN_MIN_WIDTH = 720
const MARGIN_GAP = 8
const CARD_WIDTH = 220
// 노트를 답안 쪽으로 당겨올 때 내용과 띄우는 간격, 그리고 최대로 들어올 수 있는 비율(답안 폭 기준)
const INWARD_GAP = 24
const INWARD_MAX = 0.6
// 교사가 크기를 바꿀 수 있는 범위(px). 높이는 최소 높이로만 쓴다 — 글이 길면 그만큼 늘어나 잘리지 않는다.
const MIN_W = 160
const MAX_W = 480
const MIN_H = 70

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v))
}

function noteWidth(note) {
  return clamp(note?.size?.w || CARD_WIDTH, MIN_W, MAX_W)
}

// 내용이 차지한 사각형들(content 기준 좌표) — 오른쪽이 비어 있는 줄(짧은 줄, 가운데 정렬된 표·그림 옆)에는
// 노트를 답안 쪽으로 당겨 놓기 위해 쓴다. 수식은 KaTeX 내부 글자 대신 수식 상자 하나로 센다.
const BLOCK_SELECTOR = 'img, table, [data-math], [data-fb-experiment], details, hr, pre, canvas, svg, video, iframe'
function occupiedRects(content, base) {
  const rects = []
  const push = r => {
    if (r.width || r.height) rects.push({ top: r.top - base.top, bottom: r.bottom - base.top, right: r.right - base.left })
  }
  const skip = el => el?.closest?.('[data-fb-ui], [data-math], [data-fb-experiment]')
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.data.trim() || skip(n.parentElement)) continue
    range.selectNodeContents(n)
    for (const r of range.getClientRects()) push(r)
  }
  content.querySelectorAll(BLOCK_SELECTOR).forEach(el => {
    if (!el.closest('[data-fb-ui]')) push(el.getBoundingClientRect())
  })
  return rects
}

function newNoteId() {
  return `n_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/**
 * 학생 답안 전체 보기 + 포스트잇 피드백. 교사 재생 화면(editable)과 학생 화면(읽기 전용)이 같이 쓴다.
 * 노트는 답안 내용에 고정된다(utils/feedbackAnchors.js) — 문장은 형광펜, 그림·표·수식·실험 보고서는
 * 번호 핀. 넓은 화면에선 노트를 앵커 높이에 맞춰 오른쪽 여백에, 좁은 화면에선 섹션 아래에 목록으로.
 *
 * @param {{usesSections:boolean, template:object|null, submission:object|null, experimentResult?:object|null,
 *   notes?:Array<object>, editable?:boolean, onCreate?:(note:object)=>void,
 *   onUpdate?:(id:string, patch:object)=>void, onDelete?:(id:string)=>void}} props
 */
export default function AnnotatedAnswer({
  usesSections, template, submission, experimentResult,
  notes = [], editable = false, onCreate, onUpdate, onDelete
}) {
  const rootRef = useRef(null)
  const contentRef = useRef(null)
  const sectionEls = useRef({}) // key → 답안 컨테이너
  const cardEls = useRef({}) // noteId → 여백 노트 DOM
  const marginRef = useRef(null)
  const lastColorRef = useRef('yellow')
  const [wide, setWide] = useState(false)
  const [layout, setLayout] = useState({ anchors: {}, order: [], placed: {}, placedLeft: {}, marginHeight: 0 })
  const [pending, setPending] = useState(null) // { key, anchor, left, top }
  const [editingId, setEditingId] = useState(null)
  const [activeId, setActiveId] = useState(null)

  const sections = usesSections ? (template?.sections || []) : null
  const sectionKeys = usesSections ? sections.map(s => s.id) : [TEXT_KEY]
  const showMargin = wide && (notes.length > 0 || editable)

  // ─── 측정·배치 ────────────────────────────────────────────────
  const notesRef = useRef(notes)
  notesRef.current = notes
  const showMarginRef = useRef(showMargin)
  showMarginRef.current = showMargin
  const sectionKeysRef = useRef(sectionKeys)
  sectionKeysRef.current = sectionKeys

  const relayout = useCallback(() => {
    const content = contentRef.current
    const root = rootRef.current
    if (!content || !root) return
    setWide(root.clientWidth >= MARGIN_MIN_WIDTH)
    const base = content.getBoundingClientRect()
    const anchors = {}
    for (const note of notesRef.current) {
      const key = note.sectionId || TEXT_KEY
      const container = sectionEls.current[key]
      if (!container) { anchors[note.id] = { key, top: 0, missing: true }; continue }
      const fallbackTop = container.getBoundingClientRect().top - base.top
      if (note.anchor?.type === 'element') {
        const el = resolveElementAnchor(container, note.anchor)
        if (!el) { anchors[note.id] = { key, top: fallbackTop, missing: true }; continue }
        const r = el.getBoundingClientRect()
        const pinLeft = r.left - base.left + r.width * note.anchor.x
        const pinTop = r.top - base.top + r.height * note.anchor.y
        anchors[note.id] = { key, top: pinTop - 12, pinLeft, pinTop }
      } else {
        const mark = container.querySelector(`mark.fb-mark[data-note-id="${note.id}"]`)
        if (!mark) { anchors[note.id] = { key, top: fallbackTop, missing: true }; continue }
        const r = mark.getClientRects()[0] || mark.getBoundingClientRect()
        anchors[note.id] = { key, top: r.top - base.top - 4 }
      }
    }

    const keyIndex = Object.fromEntries(sectionKeysRef.current.map((k, i) => [k, i]))
    const order = [...notesRef.current]
      .sort((a, b) => {
        const A = anchors[a.id]; const B = anchors[b.id]
        return ((keyIndex[A.key] ?? -1) - (keyIndex[B.key] ?? -1)) || (A.top - B.top) || ((a.createdAt || 0) - (b.createdAt || 0))
      })
      .map(n => n.id)

    // 형광펜 번호 배지는 노트의 마지막 조각에만 붙인다.
    content.querySelectorAll('mark.fb-mark[data-note-num]').forEach(m => m.removeAttribute('data-note-num'))
    order.forEach((id, i) => {
      const marks = content.querySelectorAll(`mark.fb-mark[data-note-id="${id}"]`)
      if (marks.length) marks[marks.length - 1].dataset.noteNum = String(i + 1)
    })

    const placed = {}
    const placedLeft = {}
    let marginHeight = 0
    if (showMarginRef.current) {
      // 세로: 앵커 높이에 맞추되 겹치면 아래로. 가로: 그 높이대에 내용이 없는 만큼 답안 쪽으로 당긴다
      // (노트끼리는 세로로 이미 안 겹치므로 가로만 옮겨도 서로 덮지 않는다).
      // 교사가 직접 옮긴 노트(pos)는 이 계산에서 빠지고 그 자리에 그대로 둔다.
      const blocks = occupiedRects(content, base)
      const rootW = root.clientWidth
      const marginLeft = marginRef.current ? marginRef.current.getBoundingClientRect().left - base.left : 0
      const minLeft = marginLeft * (1 - INWARD_MAX)
      const byId = Object.fromEntries(notesRef.current.map(n => [n.id, n]))
      let prevBottom = -Infinity
      for (const id of order) {
        const note = byId[id]
        const w = noteWidth(note)
        const h = cardEls.current[id]?.offsetHeight || 80
        if (note.pos) {
          const top = Math.max(0, anchors[id].top + (note.pos.y || 0))
          placed[id] = Math.round(top)
          placedLeft[id] = Math.round(clamp((note.pos.x || 0) * rootW, 0, Math.max(0, rootW - w)))
          marginHeight = Math.max(marginHeight, top + h)
          continue
        }
        const top = Math.max(anchors[id].top, prevBottom + MARGIN_GAP, 0)
        let right = 0
        for (const b of blocks) {
          if (b.bottom > top - MARGIN_GAP && b.top < top + h + MARGIN_GAP && b.right > right) right = b.right
        }
        placed[id] = top
        placedLeft[id] = Math.round(Math.max(0, Math.min(marginLeft, rootW - w, Math.max(minLeft, right + INWARD_GAP))))
        prevBottom = top + h
        marginHeight = Math.max(marginHeight, prevBottom)
      }
    }

    const next = { anchors, order, placed, placedLeft, marginHeight }
    setLayout(prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
  }, [])

  // 크기 변화(창 폭, 노트 높이, 이미지 로드)마다 다시 배치
  const roRef = useRef(null)
  useEffect(() => {
    let frame = 0
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(relayout) }
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null
    roRef.current = ro
    if (ro && rootRef.current) ro.observe(rootRef.current)
    Object.values(cardEls.current).forEach(el => el && ro?.observe(el))
    const root = rootRef.current
    root?.addEventListener('load', schedule, true)
    return () => {
      cancelAnimationFrame(frame)
      ro?.disconnect()
      root?.removeEventListener('load', schedule, true)
    }
  }, [relayout])

  const setCardRef = useCallback((id, el) => {
    const prev = cardEls.current[id]
    if (prev && prev !== el) roRef.current?.unobserve(prev)
    if (el) { cardEls.current[id] = el; roRef.current?.observe(el) } else delete cardEls.current[id]
  }, [])

  // dangerouslySetInnerHTML로 넣은 data-math span을 KaTeX로 그린다(안 그리면 LaTeX 구문 그대로 보임).
  useLayoutEffect(() => {
    if (contentRef.current) renderMathInElement(contentRef.current)
  }, [usesSections, template, submission])

  // 형광펜 다시 씌우기 → 배치. 노트 글자만 바뀐 경우엔 다시 씌울 필요가 없어서 위치·색으로만 비교한다
  // (매 렌더마다 걷어냈다 씌우면 hover 강조가 풀린다).
  const highlightSig = JSON.stringify(notes.map(n => [n.id, n.sectionId, n.anchor, n.color]))
  useLayoutEffect(() => {
    for (const key of sectionKeys) {
      const container = sectionEls.current[key]
      if (!container || container.dataset.fbHtml !== '1') continue
      clearHighlights(container)
      const items = []
      for (const note of notes) {
        if ((note.sectionId || TEXT_KEY) !== key || note.anchor?.type !== 'text') continue
        const loc = locateTextAnchor(container, note.anchor)
        if (loc) items.push({ id: note.id, ...loc, color: note.color })
      }
      applyHighlights(container, items)
    }
    relayout()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightSig, usesSections, template, submission, relayout])

  // 노트 글자가 바뀌면(높이 변화) 다시 배치
  useLayoutEffect(() => { relayout() }, [notes, relayout])

  // 여백 노트가 그려진(또는 편집으로 높이가 바뀐) 뒤 높이를 반영해 다시 배치
  useLayoutEffect(() => { relayout() }, [showMargin, editingId, relayout])

  // 노트·형광펜 hover 연동
  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    content.querySelectorAll('mark.fb-mark--active').forEach(m => m.classList.remove('fb-mark--active'))
    if (activeId) content.querySelectorAll(`mark.fb-mark[data-note-id="${activeId}"]`).forEach(m => m.classList.add('fb-mark--active'))
  }, [activeId, layout, highlightSig])

  // ─── 교사: 노트 만들기 ─────────────────────────────────────────
  function sectionKeyOf(node) {
    for (const key of sectionKeys) {
      const el = sectionEls.current[key]
      if (el && el.contains(node)) return key
    }
    return null
  }

  function handleMouseUp() {
    if (!editable) return
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.rangeCount) return
    const range = sel.getRangeAt(0)
    const key = sectionKeyOf(range.commonAncestorContainer)
    const container = key && sectionEls.current[key]
    if (!container || container.dataset.fbHtml !== '1') return
    const anchor = textAnchorFromRange(container, range)
    if (!anchor) return
    const rects = range.getClientRects()
    const last = rects[rects.length - 1] || range.getBoundingClientRect()
    const base = contentRef.current.getBoundingClientRect()
    setPending({ key, anchor, left: last.right - base.left, top: last.bottom - base.top + 4 })
  }

  function handleClick(e) {
    if (e.target.closest?.('[data-fb-ui]')) return
    const mark = e.target.closest?.('mark.fb-mark')
    if (mark) {
      setActiveId(mark.dataset.noteId)
      setPending(null)
      return
    }
    if (!editable) return
    const sel = window.getSelection()
    if (sel && !sel.isCollapsed) return
    const key = sectionKeyOf(e.target)
    const container = key && sectionEls.current[key]
    const anchor = container && elementAnchorFromPoint(container, e.target, e.clientX, e.clientY)
    if (!anchor) { setPending(null); return }
    const base = contentRef.current.getBoundingClientRect()
    setPending({ key, anchor, left: e.clientX - base.left, top: e.clientY - base.top + 6 })
  }

  function handleMouseOver(e) {
    const mark = e.target.closest?.('mark.fb-mark')
    const pin = e.target.closest?.('[data-fb-pin]')
    setActiveId(mark?.dataset.noteId || pin?.dataset.fbPin || null)
  }

  function createFromPending() {
    if (!pending) return
    const now = Date.now()
    const note = {
      id: newNoteId(),
      sectionId: pending.key === TEXT_KEY ? null : pending.key,
      anchor: pending.anchor,
      text: '',
      color: lastColorRef.current,
      createdAt: now,
      updatedAt: now
    }
    window.getSelection()?.removeAllRanges()
    setPending(null)
    onCreate?.(note)
    setEditingId(note.id)
  }

  function handleSave(note, patch) {
    if (patch.color) lastColorRef.current = patch.color
    if (patch.keepEditing) {
      onUpdate?.(note.id, { color: patch.color, updatedAt: Date.now() })
      return
    }
    setEditingId(null)
    const text = patch.text ?? note.text ?? ''
    if (!text.trim()) { onDelete?.(note.id); return }
    if (patch.text !== undefined) onUpdate?.(note.id, { text, updatedAt: Date.now() })
  }

  // ─── 교사: 노트 옮기기·크기 조절(넓은 화면 여백 모드에서만) ──────────────
  // 위치는 앵커 기준으로 저장한다 — x는 답안 전체 폭 대비 비율(화면 폭이 달라도 같은 쪽), y는 앵커 높이에서의
  // 거리(px). 그래서 학생이 답안을 고쳐 앵커가 아래로 밀려도 노트가 같이 따라간다.
  const [drag, setDrag] = useState(null) // { id, left, top } 또는 { id, w, h } — 끄는 동안의 미리보기
  const dragRef = useRef(null)
  const layoutRef = useRef(layout)
  layoutRef.current = layout

  function startDrag(note, mode, e) {
    if (!editable || e.button !== 0) return
    const card = cardEls.current[note.id]
    if (!card || !rootRef.current) return
    e.preventDefault()
    const lay = layoutRef.current
    const s = {
      id: note.id, mode, px: e.clientX, py: e.clientY, moved: false, last: null,
      left: lay.placedLeft[note.id] ?? 0, top: lay.placed[note.id] ?? 0,
      w: card.offsetWidth, h: card.offsetHeight, rootW: rootRef.current.clientWidth
    }
    dragRef.current = s
    setActiveId(note.id)
    const move = ev => {
      const dx = ev.clientX - s.px
      const dy = ev.clientY - s.py
      if (!s.moved && Math.abs(dx) + Math.abs(dy) < 3) return
      s.moved = true
      s.last = s.mode === 'move'
        ? { id: s.id, left: clamp(s.left + dx, 0, Math.max(0, s.rootW - s.w)), top: Math.max(0, s.top + dy) }
        : { id: s.id, w: clamp(s.w + dx, MIN_W, Math.min(MAX_W, s.rootW - s.left)), h: Math.max(MIN_H, s.h + dy) }
      setDrag(s.last)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      dragRef.current = null
      if (s.moved && s.last) {
        if (s.mode === 'move') {
          const anchorTop = layoutRef.current.anchors[s.id]?.top ?? 0
          onUpdate?.(s.id, { pos: { x: +(s.last.left / s.rootW).toFixed(4), y: Math.round(s.last.top - anchorTop) } })
        } else {
          onUpdate?.(s.id, { size: { w: Math.round(s.last.w), h: Math.round(s.last.h) } })
        }
      }
      setDrag(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  // ─── 렌더 ─────────────────────────────────────────────────────
  const numOf = id => layout.order.indexOf(id) + 1 || notes.length
  const noteById = Object.fromEntries(notes.map(n => [n.id, n]))

  function renderCard(note, style) {
    const a = layout.anchors[note.id]
    const inMargin = Boolean(style)
    return (
      <StickyNote
        key={note.id}
        ref={style ? el => setCardRef(note.id, el) : undefined}
        note={note}
        num={numOf(note.id)}
        editable={editable}
        editing={editingId === note.id}
        active={activeId === note.id}
        missing={a?.missing}
        onStartEdit={() => setEditingId(note.id)}
        onSave={patch => handleSave(note, patch)}
        onDelete={() => onDelete?.(note.id)}
        onHover={on => { if (!dragRef.current) setActiveId(on ? note.id : null) }}
        dragging={drag?.id === note.id}
        onDragStart={editable && inMargin ? e => startDrag(note, 'move', e) : undefined}
        onResizeStart={editable && inMargin ? e => startDrag(note, 'resize', e) : undefined}
        onResetLayout={editable && inMargin && (note.pos || note.size)
          ? () => onUpdate?.(note.id, { pos: null, size: null })
          : undefined}
        style={style}
      />
    )
  }

  // 좁은 화면: 섹션 아래 목록
  function renderInlineNotes(key) {
    if (showMargin) return null
    const ids = layout.order.filter(id => layout.anchors[id]?.key === key && noteById[id])
    // 첫 배치 전(order 비어 있음)에도 보이도록
    const list = ids.length ? ids.map(id => noteById[id]) : notes.filter(n => (n.sectionId || TEXT_KEY) === key && !layout.order.includes(n.id))
    if (list.length === 0) return null
    return (
      <div data-fb-ui className="mt-3 grid gap-2.5 sm:grid-cols-2">
        {list.map(n => renderCard(n))}
      </div>
    )
  }

  function registerSection(key, el) {
    if (el) sectionEls.current[key] = el
    else delete sectionEls.current[key]
  }

  function renderHtml(key, html) {
    return html
      ? <div ref={el => registerSection(key, el)} data-fb-html="1" className={ANSWER_HTML_CLASS} dangerouslySetInnerHTML={{ __html: html }} />
      : <p className="text-sm text-gray-300">(작성 내용 없음)</p>
  }

  let body
  if (usesSections) {
    let lastGroup = null
    body = sections.length === 0
      ? <p className="text-sm text-gray-300">양식을 불러오지 못했습니다.</p>
      : (
        <div className="space-y-4">
          {sections.map(sec => {
            const showGroup = sec.groupLabel && sec.groupLabel !== lastGroup
            lastGroup = sec.groupLabel
            const html = sanitizeAnswerHtml(submission?.sections?.[sec.id]?.text || '')
            return (
              <React.Fragment key={sec.id}>
                {showGroup && <h2 className="text-sm font-bold text-indigo-700 border-b border-indigo-100 pb-1.5 pt-2">{sec.groupLabel}</h2>}
                <div>
                  {sec.heading && <h3 className="text-sm font-bold text-gray-800 mb-1">{sec.heading}</h3>}
                  {sec.promptHtml && (
                    <details className="mb-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-500">
                      <summary className="cursor-pointer select-none">문항 보기</summary>
                      <div className="passage-rich mt-2 text-sm text-gray-700" dangerouslySetInnerHTML={{ __html: sanitizePassageHtml(sec.promptHtml) }} />
                    </details>
                  )}
                  {sec.type === 'experiment'
                    ? (experimentResult
                      ? <div ref={el => registerSection(sec.id, el)}><div data-fb-experiment><ExperimentReport result={experimentResult} /></div></div>
                      : <p className="text-sm text-gray-300">(실험 결과 미제출)</p>)
                    : renderHtml(sec.id, html)}
                  {renderInlineNotes(sec.id)}
                </div>
              </React.Fragment>
            )
          })}
        </div>
      )
  } else {
    body = (
      <div>
        {renderHtml(TEXT_KEY, sanitizeAnswerHtml(submission?.text || ''))}
        {renderInlineNotes(TEXT_KEY)}
      </div>
    )
  }

  return (
    <div ref={rootRef} className="relative">
      <div className={showMargin ? 'grid grid-cols-[minmax(0,1fr)_220px] gap-6' : ''}>
        <div
          ref={contentRef}
          className={`relative min-w-0 ${editable ? '[&_img]:cursor-crosshair [&_table]:cursor-crosshair [&_[data-math]]:cursor-crosshair [&_[data-fb-experiment]]:cursor-crosshair' : ''}`}
          onMouseUp={handleMouseUp}
          onClick={handleClick}
          onMouseOver={handleMouseOver}
        >
          {body}

          {/* 그림·표·수식 위 핀 */}
          {notes.map(note => {
            const a = layout.anchors[note.id]
            if (!a || a.pinLeft == null) return null
            return (
              <button
                key={note.id}
                type="button"
                data-fb-ui
                data-fb-pin={note.id}
                onClick={() => { setActiveId(note.id); if (editable) setEditingId(note.id) }}
                className={`absolute z-[5] -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white transition-transform ${activeId === note.id ? 'scale-125' : ''}`}
                style={{ left: a.pinLeft, top: a.pinTop }}
                title="피드백"
              >
                <NoteBadge num={numOf(note.id)} color={note.color} />
              </button>
            )
          })}

          {editable && pending && (
            <button
              type="button"
              data-fb-ui
              onMouseDown={e => e.preventDefault()}
              onClick={createFromPending}
              className="absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white shadow-lg transition-transform hover:scale-105"
              style={{ left: pending.left, top: pending.top }}
            >
              📝 포스트잇 붙이기
            </button>
          )}
        </div>

        {showMargin && (
          <div ref={marginRef} data-fb-ui className="relative" style={{ minHeight: layout.marginHeight }}>
            {notes.length === 0 && editable && (
              <p className="rounded-lg border border-dashed border-gray-200 p-3 text-xs leading-relaxed text-gray-400">
                문장을 드래그하거나 그림·표·수식을 클릭하면 포스트잇을 붙일 수 있습니다.
              </p>
            )}
          </div>
        )}
      </div>

      {/* 여백 노트 — 답안 쪽으로 당기거나 교사가 답안 위로 옮길 수 있어서 여백 열이 아니라 전체 위에 띄운다.
          좌표는 답안 열(content) 기준인데, 답안 열이 이 상자 왼쪽 위에서 시작하므로 그대로 쓴다. */}
      {showMargin && (
        <div data-fb-ui className="pointer-events-none absolute inset-x-0 top-0">
          {notes.map(note => {
            const d = drag?.id === note.id ? drag : null
            return renderCard(note, {
              position: 'absolute',
              pointerEvents: 'auto',
              left: d?.left ?? layout.placedLeft[note.id] ?? 0,
              top: d?.top ?? layout.placed[note.id] ?? layout.anchors[note.id]?.top ?? 0,
              width: d?.w ?? noteWidth(note),
              minHeight: d?.h ?? (note.size?.h ? Math.max(MIN_H, note.size.h) : undefined),
              // 새 노트는 첫 배치 전까지 투명하게(여백 맨 위에 잠깐 번쩍이지 않게). visibility:hidden이면 focus가 안 된다.
              opacity: layout.placed[note.id] == null ? 0 : undefined,
              zIndex: d ? 30 : editingId === note.id || activeId === note.id ? 20 : 1
            })
          })}
        </div>
      )}
    </div>
  )
}
