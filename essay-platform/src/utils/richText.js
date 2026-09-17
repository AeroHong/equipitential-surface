// 학생 답안 입력창(EssayEditor)이 textarea에서 contentEditable로 바뀌면서, 저장되는
// 값이 순수 텍스트가 아니라 HTML이 됐다. 글자수 계산/AI 패턴 검사는 여전히 "학생이 실제로
// 쓴 글자 수" 기준이어야 하므로 HTML을 순수 텍스트로 환산하는 함수가 필요하다.
// (서식 sanitize는 utils/sanitizeHtml.js의 sanitizeAnswerHtml — 지문 sanitize와 같은
// DOMPurify 기반 유틸을 재사용한다. 손으로 짠 별도 sanitizer를 여기 또 만들지 않는다.)

/**
 * HTML을 순수 텍스트로 변환 — 글자수 계산, AI 패턴 검사(scanText)에 사용한다.
 * 블록 경계(문단/줄바꿈)를 \n으로 살려서, 여러 문단을 이어 붙였을 때 글자가
 * 서로 들러붙지 않게 한다.
 * @param {string} html
 * @returns {string}
 */
export function htmlToPlainText(html) {
  if (!html) return ''
  // 수식은 텍스트 분량이 아니라 하나의 수식 단위로 계산한다. KaTeX 렌더링 전후에
  // 상관없이 data-math wrapper를 먼저 치환해야 내부 접근성 텍스트가 섞이지 않는다.
  const withMathTokens = html.replace(/<span\b[^>]*\bdata-math=(?:"[^"]*"|'[^']*')[^>]*>[\s\S]*?<\/span>/gi, '¤')
  const withBreaks = withMathTokens
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, '\n')
  const el = document.createElement('div')
  el.innerHTML = withBreaks
  // 맨 앞/뒤 줄바꿈만 잘라낸다(중간 줄바꿈은 문단 구분이라 그대로 둔다) — 이미지 삽입 시
  // 캐럿 자리를 위해 붙이는 <br/>가 커서 위치용일 뿐인데도 글자수에 유령 1자로 잡히는 걸
  // 막는다(예: 이미지만 넣고 글은 안 쓴 경우 charCount가 0이 아니라 1로 나오던 문제).
  return (el.textContent || '').replace(/^\n+|\n+$/g, '')
}
