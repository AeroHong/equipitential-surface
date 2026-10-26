// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { answerToTokens, diffTokens, rangeChanged, tokenRangeOfText, tokensText } from './textDiff.js'
import { createMathHtml } from './mathExpression.js'

const words = d => d.ops.map(op => (op.type === 'ins' ? `+${op.tok}` : op.type === 'del' ? `-${op.tok}` : op.tok))

function diff(a, b) {
  const A = answerToTokens(a).tokens
  const B = answerToTokens(b).tokens
  const d = diffTokens(A, B)
  d.ops.forEach(op => { op.tok = op.type === 'ins' ? B[op.b].t : A[op.a].t })
  return d
}

describe('textDiff', () => {
  it('같은 답안은 변경 없음', () => {
    expect(diff('<p>운동량은 보존된다.</p>', '<p>운동량은 보존된다.</p>').changed).toBe(false)
  })

  it('단어 단위로 지움·추가를 찾는다', () => {
    const d = diff('<p>속력이 빠르다.</p>', '<p>속력이 매우 느리다.</p>')
    expect(d.changed).toBe(true)
    expect(words(d).filter(w => w.startsWith('+') || w.startsWith('-'))).toEqual(expect.arrayContaining(['-빠르다', '+느리다', '+매우']))
  })

  it('그림·수식은 토큰 하나로, 내용이 바뀌면 지움+추가', () => {
    const a = `<p>식 ${createMathHtml('F=ma')} 와 <img src="https://x.test/a.png"></p>`
    const b = `<p>식 ${createMathHtml('F=mg')} 와 <img src="https://x.test/a.png"></p>`
    const A = answerToTokens(a)
    expect(A.elements.math).toHaveLength(1)
    expect(A.tokens.find(t => t.kind === 'math').latex).toBe('F=ma')
    expect(A.elements.img[0].key).toBe('https://x.test/a.png')
    const d = diff(a, b)
    expect(words(d)).toEqual(expect.arrayContaining(['-[수식 F=ma]', '+[수식 F=mg]', '[그림 https://x.test/a.png]']))
  })

  it('글자 오프셋은 수식 내부를 빼고 센다(포스트잇 앵커와 같은 기준)', () => {
    const { tokens } = answerToTokens(`<p>속력 ${createMathHtml('v=at')} 이므로 증가</p>`)
    expect(tokensText(tokens)).toBe('속력  이므로 증가')
    const r = tokenRangeOfText(tokens, 8, 10)
    expect(tokens[r.i0].t).toBe('증가')
  })

  it('포스트잇 문장이 고쳐졌는지 판단한다', () => {
    const base = '<p>운동량은 보존된다. 에너지도 같다.</p>'
    const A = answerToTokens(base).tokens
    const text = tokensText(A)
    const s = text.indexOf('운동량은 보존된다')
    const r = tokenRangeOfText(A, s, s + '운동량은 보존된다'.length)
    const kept = diffTokens(A, answerToTokens('<p>운동량은 보존된다. 에너지는 다르다.</p>').tokens)
    expect(rangeChanged(kept, r.i0, r.i1)).toBe(false)
    const edited = diffTokens(A, answerToTokens('<p>운동량은 항상 보존된다. 에너지도 같다.</p>').tokens)
    expect(rangeChanged(edited, r.i0, r.i1)).toBe(true)
  })
})
