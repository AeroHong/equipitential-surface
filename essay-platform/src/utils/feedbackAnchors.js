// 포스트잇 피드백의 "답안 속 위치" 계산 — 교사 화면에서 만든 앵커를 학생 화면(폭·글꼴이 다름)에서도
// 같은 곳으로 되살려야 하므로 픽셀 좌표가 아니라 내용 기준으로 저장한다.
//  - 문장: 답안 컨테이너 텍스트 노드 기준 글자 오프셋 + 원문(quote)
//  - 그림·표·수식·실험 보고서: 그 종류의 n번째 요소 + 요소 안 상대 좌표(0~1)
// 수식([data-math])은 KaTeX가 그린 결과라 브라우저·렌더 시점마다 텍스트가 달라질 수 있어 오프셋
// 계산에서 통째로 뺀다 — 수식에는 요소 앵커(핀)로 붙인다.

const MATH_SELECTOR = '[data-math]'

export const ELEMENT_KINDS = [
  // 안쪽 것을 먼저 찾는다(표 안의 수식·그림은 표가 아니라 그 수식·그림에 붙인다).
  { kind: 'math', selector: MATH_SELECTOR },
  { kind: 'img', selector: 'img' },
  { kind: 'table', selector: 'table' },
  { kind: 'experiment', selector: '[data-fb-experiment]' }
]

function isCountedText(node, container) {
  const parent = node.parentElement
  if (!parent) return false
  const math = parent.closest(MATH_SELECTOR)
  return !math || !container.contains(math)
}

/** 오프셋 계산에 들어가는 텍스트 노드들(문서 순서) */
export function countedTextNodes(container) {
  const doc = container.ownerDocument
  const walker = doc.createTreeWalker(container, 4 /* NodeFilter.SHOW_TEXT */, {
    acceptNode: n => (isCountedText(n, container) ? 1 : 3) // FILTER_ACCEPT : FILTER_SKIP
  })
  const nodes = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n)
  return nodes
}

export function countedText(container) {
  return countedTextNodes(container).map(n => n.data).join('')
}

function boundaryToOffset(container, nodes, node, offset) {
  const probe = container.ownerDocument.createRange()
  probe.setStart(node, offset)
  probe.collapse(true)
  let acc = 0
  for (const t of nodes) {
    if (t === node) return acc + offset
    // t가 경계점보다 뒤에서 시작하면 경계는 t 앞이다.
    if (probe.comparePoint(t, 0) > 0) return acc
    acc += t.data.length
  }
  return acc
}

/**
 * 선택 영역 → 문장 앵커. 컨테이너 밖이거나 (수식만 고른 경우처럼) 글자가 없으면 null.
 * @returns {{type:'text', start:number, end:number, quote:string}|null}
 */
export function textAnchorFromRange(container, range) {
  if (!range || !container.contains(range.commonAncestorContainer)) return null
  const nodes = countedTextNodes(container)
  const start = boundaryToOffset(container, nodes, range.startContainer, range.startOffset)
  const end = boundaryToOffset(container, nodes, range.endContainer, range.endOffset)
  if (end <= start) return null
  const quote = nodes.map(n => n.data).join('').slice(start, end)
  if (!quote.trim()) return null
  return { type: 'text', start, end, quote }
}

/**
 * 저장된 문장 앵커의 실제 위치. 오프셋 자리 글자가 원문과 다르면(재열기 후 학생이 고친 경우)
 * 원문을 다시 찾아 원래 자리에서 가장 가까운 곳을 쓴다. 못 찾으면 null.
 * @returns {{start:number, end:number}|null}
 */
export function locateTextAnchor(container, anchor) {
  const full = countedText(container)
  const { start, end, quote } = anchor
  if (full.slice(start, end) === quote) return { start, end }
  if (!quote) return null
  let best = -1
  for (let i = full.indexOf(quote); i !== -1; i = full.indexOf(quote, i + 1)) {
    if (best === -1 || Math.abs(i - start) < Math.abs(best - start)) best = i
  }
  return best === -1 ? null : { start: best, end: best + quote.length }
}

function splitSegments(nodes, start, end) {
  const segments = []
  let acc = 0
  for (const node of nodes) {
    const len = node.data.length
    const s = Math.max(start, acc)
    const e = Math.min(end, acc + len)
    if (s < e) segments.push({ node, from: s - acc, to: e - acc })
    acc += len
    if (acc >= end) break
  }
  return segments
}

/**
 * 문장 앵커들에 형광펜(<mark class="fb-mark">)을 씌운다. 텍스트 노드를 쪼개 감쌀 뿐 글자는
 * 그대로라 오프셋은 바뀌지 않는다(겹치는 피드백도 순서대로 씌우면 된다).
 * @param {Array<{id:string, start:number, end:number, color?:string, num?:number}>} items
 */
export function applyHighlights(container, items) {
  const doc = container.ownerDocument
  for (const item of items) {
    const segments = splitSegments(countedTextNodes(container), item.start, item.end)
    segments.forEach((seg, i) => {
      let target = seg.node
      if (seg.to < target.data.length) target.splitText(seg.to)
      if (seg.from > 0) target = target.splitText(seg.from)
      const mark = doc.createElement('mark')
      mark.className = 'fb-mark'
      mark.dataset.noteId = item.id
      if (item.color) mark.dataset.color = item.color
      if (i === segments.length - 1 && item.num != null) mark.dataset.noteNum = String(item.num)
      target.parentNode.insertBefore(mark, target)
      mark.appendChild(target)
    })
  }
}

/** applyHighlights로 씌운 형광펜을 걷어내 원래 DOM으로 되돌린다. */
export function clearHighlights(container) {
  const marks = container.querySelectorAll('mark.fb-mark')
  if (marks.length === 0) return
  marks.forEach(mark => {
    const parent = mark.parentNode
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
    parent.removeChild(mark)
  })
  container.normalize()
}

/** 클릭한 지점이 그림·표·수식·실험 보고서 안이면 그 요소(가장 안쪽 종류 우선)와 종류 */
export function findAnchorElement(container, target) {
  const start = target?.nodeType === 1 ? target : target?.parentElement
  if (!start || !container.contains(start)) return null
  for (const { kind, selector } of ELEMENT_KINDS) {
    const el = start.closest(selector)
    if (el && container.contains(el)) return { kind, el }
  }
  return null
}

const clamp01 = v => Math.min(1, Math.max(0, v))

/**
 * 클릭 지점 → 요소 앵커
 * @returns {{type:'element', kind:string, index:number, x:number, y:number}|null}
 */
export function elementAnchorFromPoint(container, target, clientX, clientY) {
  const found = findAnchorElement(container, target)
  if (!found) return null
  const { kind, el } = found
  const selector = ELEMENT_KINDS.find(k => k.kind === kind).selector
  const index = [...container.querySelectorAll(selector)].indexOf(el)
  const rect = el.getBoundingClientRect()
  const x = rect.width ? clamp01((clientX - rect.left) / rect.width) : 0.5
  const y = rect.height ? clamp01((clientY - rect.top) / rect.height) : 0.5
  return { type: 'element', kind, index, x, y }
}

/** 저장된 요소 앵커가 가리키는 요소. 없어졌으면 null. */
export function resolveElementAnchor(container, anchor) {
  const entry = ELEMENT_KINDS.find(k => k.kind === anchor.kind)
  if (!entry) return null
  return container.querySelectorAll(entry.selector)[anchor.index] || null
}
