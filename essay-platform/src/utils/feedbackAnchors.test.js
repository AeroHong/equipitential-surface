// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  applyHighlights, clearHighlights, countedText, elementAnchorFromPoint,
  locateTextAnchor, resolveElementAnchor, textAnchorFromRange
} from './feedbackAnchors.js'

function make(html) {
  const el = document.createElement('div')
  el.innerHTML = html
  document.body.appendChild(el)
  return el
}

function rangeOf(container, text) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const i = n.data.indexOf(text)
    if (i !== -1) {
      const r = document.createRange()
      r.setStart(n, i)
      r.setEnd(n, i + text.length)
      return r
    }
  }
  throw new Error(`not found: ${text}`)
}

describe('feedbackAnchors', () => {
  it('선택 영역을 글자 오프셋으로 바꾸고 되찾는다(서식 경계 포함)', () => {
    const c = make('<p>운동량은 <b>보존</b>된다.</p><p>둘째 문단</p>')
    const r = document.createRange()
    r.setStart(rangeOf(c, '보존').startContainer, 0)
    r.setEnd(rangeOf(c, '된다').startContainer, 2)
    const a = textAnchorFromRange(c, r)
    expect(a).toEqual({ type: 'text', start: 5, end: 9, quote: '보존된다' })
    expect(locateTextAnchor(c, a)).toEqual({ start: 5, end: 9 })
  })

  it('수식 내부 텍스트는 오프셋에서 뺀다', () => {
    const c = make('<p>속력 <span data-math="x"><span class="katex">v=at</span></span> 이므로 증가</p>')
    expect(countedText(c)).toBe('속력  이므로 증가')
    const a = textAnchorFromRange(c, rangeOf(c, '증가'))
    expect(a.quote).toBe('증가')
    expect(a.start).toBe(8)
  })

  it('원문이 옮겨졌으면 원문을 다시 찾고, 사라졌으면 null', () => {
    const c = make('<p>앞에 글이 추가됨. 핵심 문장입니다.</p>')
    const moved = { type: 'text', start: 0, end: 6, quote: '핵심 문장입' }
    expect(locateTextAnchor(c, moved)).toEqual({ start: 11, end: 17 })
    expect(locateTextAnchor(c, { type: 'text', start: 0, end: 3, quote: '없는말' })).toBeNull()
  })

  it('형광펜을 씌워도 오프셋이 그대로이고, 걷어내면 원래 DOM으로 돌아온다', () => {
    const c = make('<p>하나 둘 셋 넷</p>')
    const before = c.innerHTML
    applyHighlights(c, [
      { id: 'a', start: 3, end: 6, color: 'yellow', num: 1 },
      { id: 'b', start: 5, end: 9, color: 'pink', num: 2 }
    ])
    expect(c.querySelectorAll('mark.fb-mark').length).toBeGreaterThanOrEqual(2)
    expect(countedText(c)).toBe('하나 둘 셋 넷')
    expect(c.querySelector('mark[data-note-num="2"]').dataset.noteId).toBe('b')
    clearHighlights(c)
    expect(c.innerHTML).toBe(before)
  })

  it('그림·표·수식 클릭을 요소 앵커로 바꾸고 되찾는다(안쪽 요소 우선)', () => {
    const c = make('<p><img src="a.png"></p><table><tbody><tr><td>칸 <img src="b.png"></td></tr></tbody></table>')
    const imgs = c.querySelectorAll('img')
    imgs[1].getBoundingClientRect = () => ({ left: 100, top: 50, width: 200, height: 100 })
    const a = elementAnchorFromPoint(c, imgs[1], 150, 100)
    expect(a).toEqual({ type: 'element', kind: 'img', index: 1, x: 0.25, y: 0.5 })
    expect(resolveElementAnchor(c, a)).toBe(imgs[1])

    const td = c.querySelector('td')
    expect(elementAnchorFromPoint(c, td, 0, 0).kind).toBe('table')
    expect(resolveElementAnchor(c, { kind: 'img', index: 5 })).toBeNull()
  })
})
