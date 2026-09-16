// smart-teachers-office(apps/shared/lib/richText.js)에서 이식 + essay-platform 지문 범위로 축소.
// 원본은 표/토글/콜아웃/날짜칩/캔버스카드/북마크카드/멘션칩/체크리스트까지 허용하지만,
// 리치 에디터(components/richtext/) 이식 범위(굵게/기울임/밑줄/취소선/목록/제목/인용/구분선/
// 링크/이미지/글자색)에 맞춰 태그를 줄였다.
import DOMPurify from 'dompurify'

const ALLOWED_TAGS = [
  'p', 'br', 'span',
  'b', 'strong', 'i', 'em', 'u', 's', 'strike',
  'ul', 'ol', 'li',
  'a', 'img', 'hr',
  'blockquote',
  'h1', 'h2', 'h3', 'h4'
]

// style은 통째로 허용하지 않고 color만 남긴다(아래 STYLE_ATTR 처리).
const ALLOWED_ATTR = ['href', 'target', 'rel', 'src', 'alt', 'width', 'height', 'color', 'style']

const STYLE_ATTR = /\sstyle="([^"]*)"/gi

// 본문 안 링크는 늘 새 탭으로 연다(원본과 동일한 이유: 앱 안에서 그대로 열리는 것을 방지).
if (typeof DOMPurify.addHook === 'function') {
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && node.hasAttribute('href')) {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
    }
  })
}

/** 지문 본문 HTML을 안전한 부분집합으로 정제한다 (저장 시/렌더 시 이중으로 호출해도 안전, 멱등). */
export function sanitizePassageHtml(html) {
  if (!html) return ''
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // data:·javascript: 주소를 막는다. 이미지는 Storage 다운로드 URL만 쓴다.
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:)/i,
    ADD_URI_SAFE_ATTR: ['width', 'height']
  }).replace(STYLE_ATTR, (match, value) => {
    const color = /(^|;)\s*color\s*:\s*([^;]+)/i.exec(value)
    return color ? ` style="color:${color[2].trim()}"` : ''
  })
}

/** 태그를 걷어낸 평문. 지문 목록 미리보기에 쓴다. */
export function htmlToText(html) {
  if (!html) return ''
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<hr\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-4]|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '· ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** 내용이 실제로 있는지. 빈 <p><br></p> 같은 껍데기를 걸러낸다. */
export function isEmptyHtml(html) {
  if (!html) return true
  return htmlToText(html).length === 0 && !/<img\b/i.test(html)
}
