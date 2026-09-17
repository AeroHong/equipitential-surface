// 학생 답안 입력창(EssayEditor)이 textarea에서 contentEditable로 바뀌면서, 저장되는
// 값이 순수 텍스트가 아니라 HTML이 됐다. 글자수 계산/AI 패턴 검사는 여전히 "학생이 실제로
// 쓴 글자 수" 기준이어야 하므로 HTML을 순수 텍스트로 환산하는 함수가 필요하고, 리플레이
// 화면(교사가 학생이 쓴 서식을 그대로 봄)에서 그 HTML을 다시 그리려면 학생 계정이 devtools로
// 직접 조작해 심어놓을 수 있는 위험한 태그/속성을 걸러내는 함수도 필요하다.

/**
 * HTML을 순수 텍스트로 변환 — 글자수 계산, AI 패턴 검사(scanText)에 사용한다.
 * 블록 경계(문단/줄바꿈)를 \n으로 살려서, 여러 문단을 이어 붙였을 때 글자가
 * 서로 들러붙지 않게 한다.
 * @param {string} html
 * @returns {string}
 */
export function htmlToPlainText(html) {
  if (!html) return ''
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, '\n')
  const el = document.createElement('div')
  el.innerHTML = withBreaks
  return el.textContent || ''
}

// 서식 태그는 기본 서식(굵게/기울임/밑줄/취소선/목록)만 허용한다 — 학생 계정이 devtools로
// Firestore 문서를 직접 고쳐 <script>나 이벤트 핸들러 속성을 심어도, 교사가 리플레이
// 화면에서 그 HTML을 dangerouslySetInnerHTML로 그릴 때 실행되지 않도록 렌더링 직전에
// 반드시 이 함수를 거친다(학생 → 교사로 신뢰 경계를 넘는 지점이라 여기서 막아야 한다).
const ALLOWED_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'UL', 'OL', 'LI', 'BR', 'P', 'DIV'])
const DROP_ENTIRELY = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED'])

/**
 * 허용 목록 기반 HTML sanitize. 허용 태그가 아니면 태그만 벗기고 내용(텍스트)은 남기며,
 * 스크립트류는 통째로 제거한다. 모든 태그의 속성은 전부 제거한다(href/style/on* 등
 * 어떤 속성도 남기지 않음 — 이 에디터는 링크/이미지/색상을 지원하지 않으므로 속성이
 * 남아있을 이유가 없다).
 * @param {string} html
 * @returns {string}
 */
export function sanitizeHtml(html) {
  if (!html) return ''
  const template = document.createElement('template')
  template.innerHTML = html
  const all = [...template.content.querySelectorAll('*')]
  for (const el of all) {
    if (DROP_ENTIRELY.has(el.tagName)) {
      el.remove()
      continue
    }
    for (const attr of [...el.attributes]) el.removeAttribute(attr.name)
    if (!ALLOWED_TAGS.has(el.tagName)) {
      const parent = el.parentNode
      if (parent) {
        while (el.firstChild) parent.insertBefore(el.firstChild, el)
        parent.removeChild(el)
      }
    }
  }
  return template.innerHTML
}
