// 피드백 반영 "수정 비교" — 피드백 공개 시점 답안(baseline)과 지금 답안을 단어 단위로 비교한다.
// 토큰의 글자 오프셋(off)은 feedbackAnchors.countedText와 같은 기준이라(수식 내부 글자 제외, 공백 포함)
// 포스트잇 문장 앵커가 어느 토큰에 걸리는지 바로 알 수 있다.
import { sanitizeAnswerHtml } from './sanitizeHtml.js'
import { decodeLatex, decodeMathExpression, mathToLatex } from './mathExpression.js'

const BLOCK_TAGS = new Set(['P', 'DIV', 'LI', 'TR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'TABLE'])
// 단어 / 공백 덩어리 / 구두점 한 글자
const WORD_RE = /\s+|[^\s.,!?;:()[\]{}"'“”‘’·…~]+|[^\s]/g

function mathLatex(el) {
  const raw = el.getAttribute('data-math') || ''
  try {
    return el.getAttribute('data-math-format') === 'tex' ? decodeLatex(raw) : mathToLatex(decodeMathExpression(raw))
  } catch {
    return ''
  }
}

/**
 * 답안 HTML → 토큰 목록 + 그림·수식·표의 토큰 범위(문서 순서 = querySelectorAll 순서).
 * 토큰: { t: 비교용 문자열, kind: 'text'|'br'|'sep'|'img'|'math'|'table', off, len, src?, latex? }
 * @returns {{tokens:Array<object>, elements:{img:Array, math:Array, table:Array}}}
 */
export function answerToTokens(html) {
  const doc = document.implementation.createHTMLDocument('') // 분리된 문서 — 이미지를 내려받지 않는다
  const root = doc.createElement('div')
  root.innerHTML = sanitizeAnswerHtml(html || '')
  const tokens = []
  const elements = { img: [], math: [], table: [] }
  let off = 0

  const breakLine = () => {
    const last = tokens[tokens.length - 1]
    if (last && last.kind !== 'br') tokens.push({ t: '\n', kind: 'br', off, len: 0 })
  }

  const walk = node => {
    if (node.nodeType === 3) {
      for (const m of node.data.matchAll(WORD_RE)) {
        tokens.push({ t: m[0], kind: 'text', off: off + m.index, len: m[0].length })
      }
      off += node.data.length
      return
    }
    if (node.nodeType !== 1) return
    const tag = node.tagName
    if (node.hasAttribute('data-math')) {
      const latex = mathLatex(node)
      elements.math.push({ key: node.getAttribute('data-math'), i0: tokens.length, i1: tokens.length + 1 })
      tokens.push({ t: `[수식 ${latex}]`, kind: 'math', off, len: 0, latex })
      return // KaTeX 내부 글자는 오프셋에 안 들어간다(feedbackAnchors와 같은 규칙)
    }
    if (tag === 'IMG') {
      const src = node.getAttribute('src') || ''
      elements.img.push({ key: src, i0: tokens.length, i1: tokens.length + 1 })
      tokens.push({ t: `[그림 ${src}]`, kind: 'img', off, len: 0, src })
      return
    }
    if (tag === 'BR') { breakLine(); return }
    if ((tag === 'TD' || tag === 'TH') && tokens.length && tokens[tokens.length - 1].kind !== 'br') {
      tokens.push({ t: ' | ', kind: 'sep', off, len: 0 }) // 칸 구분(오프셋엔 안 들어감)
    }
    const block = BLOCK_TAGS.has(tag)
    if (block) breakLine()
    const tableEntry = tag === 'TABLE' ? { i0: tokens.length, i1: 0 } : null
    if (tableEntry) {
      elements.table.push(tableEntry)
      tokens.push({ t: '[표]', kind: 'table', off, len: 0 })
    }
    for (const child of node.childNodes) walk(child)
    if (tableEntry) tableEntry.i1 = tokens.length
    if (block) breakLine()
  }
  for (const child of root.childNodes) walk(child)
  while (tokens.length && tokens[tokens.length - 1].kind === 'br') tokens.pop()
  return { tokens, elements }
}

// 공통 앞뒤를 잘라낸 뒤의 LCS 표가 이보다 크면 가운데를 통째로 "지움+추가"로 본다(브라우저 멈춤 방지).
const MAX_CELLS = 4_000_000

/**
 * 토큰 비교. a(baseline)의 각 토큰 상태와, 그 앞에 끼어든 b 토큰 수를 함께 돌려준다.
 * @returns {{ops:Array<{type:'same'|'del'|'ins', a?:number, b?:number}>, aState:string[], insBefore:number[], changed:boolean}}
 */
export function diffTokens(a, b) {
  const n = a.length
  const m = b.length
  let pre = 0
  while (pre < n && pre < m && a[pre].t === b[pre].t) pre++
  let suf = 0
  while (suf < n - pre && suf < m - pre && a[n - 1 - suf].t === b[m - 1 - suf].t) suf++

  const midOps = []
  const N = n - pre - suf
  const M = m - pre - suf
  if (N * M > MAX_CELLS) {
    for (let i = 0; i < N; i++) midOps.push({ type: 'del', a: pre + i })
    for (let j = 0; j < M; j++) midOps.push({ type: 'ins', b: pre + j })
  } else if (N || M) {
    // dp[i][j] = a[pre+i..], b[pre+j..]의 LCS 길이 (뒤에서부터 채워 앞에서부터 따라간다)
    const W = M + 1
    const dp = new Uint32Array((N + 1) * W)
    for (let i = N - 1; i >= 0; i--) {
      for (let j = M - 1; j >= 0; j--) {
        dp[i * W + j] = a[pre + i].t === b[pre + j].t
          ? dp[(i + 1) * W + j + 1] + 1
          : Math.max(dp[(i + 1) * W + j], dp[i * W + j + 1])
      }
    }
    let i = 0
    let j = 0
    while (i < N || j < M) {
      if (i < N && j < M && a[pre + i].t === b[pre + j].t) { midOps.push({ type: 'same', a: pre + i, b: pre + j }); i++; j++ }
      else if (j < M && (i === N || dp[i * W + j + 1] > dp[(i + 1) * W + j])) { midOps.push({ type: 'ins', b: pre + j }); j++ } // 동점이면 지움 먼저(지운 것 → 새로 쓴 것 순서로 읽히게)
      else { midOps.push({ type: 'del', a: pre + i }); i++ }
    }
  }

  const ops = []
  for (let k = 0; k < pre; k++) ops.push({ type: 'same', a: k, b: k })
  ops.push(...midOps)
  for (let k = suf; k > 0; k--) ops.push({ type: 'same', a: n - k, b: m - k })

  const aState = new Array(n).fill('same')
  const insBefore = new Array(n + 1).fill(0)
  let ai = 0
  for (const op of ops) {
    if (op.type === 'ins') insBefore[ai]++
    else { if (op.type === 'del') aState[op.a] = 'del'; ai = op.a + 1 }
  }
  return { ops, aState, insBefore, changed: ops.some(op => op.type !== 'same') }
}

/** baseline 토큰 범위 [i0, i1)가 바뀌었는지 — 안의 토큰이 지워졌거나 범위 안쪽에 새 토큰이 끼었으면 true */
export function rangeChanged(diff, i0, i1) {
  for (let i = i0; i < i1; i++) if (diff.aState[i] === 'del') return true
  for (let i = i0 + 1; i < i1; i++) if (diff.insBefore[i] > 0) return true
  return false
}

/** 글자 오프셋 범위 [start, end)에 걸치는 글자 토큰의 인덱스 범위. 하나도 없으면 null. */
export function tokenRangeOfText(tokens, start, end) {
  let i0 = -1
  let i1 = -1
  tokens.forEach((tok, i) => {
    if (tok.kind === 'text' && tok.off < end && tok.off + tok.len > start) {
      if (i0 === -1) i0 = i
      i1 = i + 1
    }
  })
  return i0 === -1 ? null : { i0, i1 }
}

/** 토큰들의 countedText(문장 앵커 기준 글자열) */
export function tokensText(tokens) {
  return tokens.filter(t => t.kind === 'text').map(t => t.t).join('')
}
