// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { linkifyText } from './linkifyText.js'

describe('linkifyText', () => {
  it('turns a markdown-style [text](url) into a clickable link with the given label', () => {
    const html = linkifyText('참고자료는 [여기](https://example.com/doc)에서 확인하세요.')
    expect(html).toBe('참고자료는 <a href="https://example.com/doc" target="_blank" rel="noopener noreferrer" class="text-indigo-600 underline hover:text-indigo-700">여기</a>에서 확인하세요.')
  })

  it('turns a bare URL into a clickable link using the URL itself as the label', () => {
    const html = linkifyText('자료: https://example.com/doc 를 참고하세요.')
    expect(html).toContain('<a href="https://example.com/doc" target="_blank" rel="noopener noreferrer"')
    expect(html).toContain('>https://example.com/doc</a>')
  })

  it('leaves plain text without any link untouched (aside from escaping)', () => {
    expect(linkifyText('이 보고서 양식에 대한 간단한 안내')).toBe('이 보고서 양식에 대한 간단한 안내')
  })

  it('returns an empty string for empty input', () => {
    expect(linkifyText('')).toBe('')
    expect(linkifyText(undefined)).toBe('')
  })

  it('escapes HTML in teacher-typed text so it cannot inject markup (XSS safety)', () => {
    const html = linkifyText('<img src=x onerror=alert(1)> 참고: https://example.com')
    const root = document.createElement('div')
    root.innerHTML = html
    expect(root.querySelector('img')).toBeNull()
    expect(root.querySelectorAll('a')).toHaveLength(1)
    expect(root.querySelector('a').getAttribute('href')).toBe('https://example.com')
  })

  it('escapes HTML inside the markdown link text and URL too', () => {
    const html = linkifyText('[<b>클릭</b>](https://example.com/a?x=1&y=2)')
    const root = document.createElement('div')
    root.innerHTML = html
    expect(root.querySelector('b')).toBeNull()
    const a = root.querySelector('a')
    expect(a.getAttribute('href')).toBe('https://example.com/a?x=1&y=2')
    expect(a.textContent).toBe('<b>클릭</b>')
  })
})
