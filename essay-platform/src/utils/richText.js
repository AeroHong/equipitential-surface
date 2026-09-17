// 답안 HTML을 분량 계산과 AI 패턴 검사에 쓸 순수 텍스트로 환산한다.

/**
 * HTML을 순수 텍스트로 변환한다. 블록 경계는 줄바꿈으로 보존하고,
 * 저장 수식은 하나의 분량 단위(¤)로 환산한다.
 * @param {string} html
 * @returns {string}
 */
export function htmlToPlainText(html) {
  if (!html) return ''
  // KaTeX 렌더링 전후와 관계없이 수식 wrapper 자체를 하나의 문자로 바꾼다.
  const withMathTokens = html.replace(/<span\b[^>]*\bdata-math=(?:"[^"]*"|'[^']*')[^>]*>[\s\S]*?<\/span>/gi, '¤')
  const withBreaks = withMathTokens
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, '\n')
  const el = document.createElement('div')
  el.innerHTML = withBreaks
  // 수식 뒤 새 줄 캐럿을 유지하는 zero-width 문자(\u200B)는 학생 분량에 포함하지 않는다.
  return (el.textContent || '').replace(/\u200B/g, '').replace(/^\n+|\n+$/g, '')
}
