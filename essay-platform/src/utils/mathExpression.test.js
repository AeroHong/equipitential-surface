// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createMathExpression, createMathHtml, decodeLatex, decodeMathExpression, encodeLatex, insertLineBreakAfterMath, mathPlainLabel, mathToLatex, normalizeMathExpression, renderMathInElement } from './mathExpression.js'
import { sanitizeAnswerHtml } from './sanitizeHtml.js'
import { htmlToPlainText } from './richText.js'

describe('student math expressions', () => {
  it('round-trips a structured fraction without exposing LaTeX in stored HTML', () => {
    const expression = { template: 'fraction', values: { top: 'x+1', bottom: '2' } }
    const html = createMathHtml(expression)
    const encoded = html.match(/data-math="([^"]+)"/)?.[1]

    expect(encoded).toBeTruthy()
    expect(decodeMathExpression(encoded)).toEqual(expression)
    expect(html).not.toContain('\\frac')
    expect(mathToLatex(expression)).toBe('\\frac{x+1}{2}')
  })

  it('keeps only the safe math wrapper during answer sanitization', () => {
    const html = `${createMathHtml(createMathExpression('sqrt'))}<img src=x onerror=alert(1)>`
    const safe = sanitizeAnswerHtml(html)

    expect(safe).toContain('data-math=')
    expect(safe).toContain('data-math-mode="inline"')
    expect(safe).not.toContain('onerror')
  })

  it('counts each stored formula as one character and leaves adjacent text intact', () => {
    const html = `풀이: ${createMathHtml({ template: 'power', values: { base: 'x', exponent: '2' } })} 입니다.`

    expect(htmlToPlainText(html)).toBe('풀이: ¤ 입니다.')
    expect(htmlToPlainText(html)).toHaveLength(10)
    expect(mathPlainLabel({ template: 'power', values: { base: 'x', exponent: '2' } })).toBe('x^2')
  })

  it('adds a line break after a formula without cloning the formula node', () => {
    const root = document.createElement('div')
    root.contentEditable = 'true'
    root.innerHTML = createMathHtml({ template: 'power', values: { base: 'A', exponent: '2' } })
    const math = root.querySelector('[data-math]')
    document.body.append(root)
    const range = document.createRange()
    range.setStartAfter(math)
    range.collapse(true)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)

    expect(insertLineBreakAfterMath(root)).toBe(true)
    expect(root.querySelectorAll('[data-math]')).toHaveLength(1)
    expect(root.querySelector('br')).not.toBeNull()
    expect(htmlToPlainText(root.innerHTML)).toBe('¤')
    expect(selection.anchorNode.textContent).toBe('\u200B')
    root.remove()
  })

  it('supports a formula nested inside another formula slot', () => {
    const nested = { template: 'fraction', values: { top: '1', bottom: '2' } }
    const outer = { template: 'power', values: { base: 'x', exponent: nested } }

    expect(mathToLatex(outer)).toBe('{x}^{\\frac{1}{2}}')
    expect(mathPlainLabel(outer)).toBe('x^(1)/(2)')

    const encoded = createMathHtml(outer).match(/data-math="([^"]+)"/)?.[1]
    expect(decodeMathExpression(encoded)).toEqual(normalizeMathExpression(outer))
  })

  // ── MathLive 도입 이후: 원본 LaTeX를 그대로 저장하는 신규 형식 ──────────────
  it('round-trips a free-form LaTeX formula (new format) without going through the legacy template', () => {
    const latex = 'x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}'
    const html = createMathHtml(latex, 'block')
    const encoded = html.match(/data-math="([^"]+)"/)?.[1]

    expect(html).toContain('data-math-format="tex"')
    expect(html).toContain('data-math-mode="block"')
    expect(decodeLatex(encoded)).toBe(latex)
    expect(decodeLatex(encodeLatex(latex))).toBe(latex)
  })

  it('renders a complex new-format formula (quadratic formula) through KaTeX without throwing', () => {
    const latex = 'x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}'
    const root = document.createElement('div')
    root.innerHTML = createMathHtml(latex, 'block')
    renderMathInElement(root)

    const node = root.querySelector('[data-math]')
    expect(node.querySelector('.katex')).not.toBeNull()
    expect(node.querySelector('.katex-error')).toBeNull()
  })

  it('renders legacy and new-format formulas correctly when mixed in the same document', () => {
    const root = document.createElement('div')
    root.innerHTML = createMathHtml(createMathExpression('sqrt')) + createMathHtml('x^2+1')
    renderMathInElement(root)

    const nodes = root.querySelectorAll('[data-math]')
    expect(nodes).toHaveLength(2)
    expect([...nodes].every(n => n.querySelector('.katex'))).toBe(true)
  })

  it('HTML-escapes user-typed content so it cannot break out of the stored markup (XSS safety)', () => {
    const malicious = '<img src=x onerror=alert(1)>'
    const legacyHtml = createMathHtml({ template: 'plain', values: { main: malicious } })
    const newHtml = createMathHtml(malicious)

    // 실제 위험은 <img>가 "요소"로 만들어지는지다(속성값 안의 <, > 글자 자체는 HTML
    // 문법상 안전하다 — 따옴표를 깨고 나올 수 있는지가 핵심이므로 DOM으로 파싱해 확인한다).
    for (const html of [legacyHtml, newHtml, sanitizeAnswerHtml(legacyHtml), sanitizeAnswerHtml(newHtml)]) {
      const root = document.createElement('div')
      root.innerHTML = html
      expect(root.querySelector('img')).toBeNull()
    }
  })

  it('keeps data-math-format on the new format through answer sanitization', () => {
    const safe = sanitizeAnswerHtml(createMathHtml('x^2', 'inline'))
    expect(safe).toContain('data-math-format="tex"')
  })
})
