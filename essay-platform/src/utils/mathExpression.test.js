// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createMathExpression, createMathHtml, decodeMathExpression, mathPlainLabel, mathToLatex } from './mathExpression.js'
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
})
