import DOMPurify from 'dompurify'

// DOCX 지문 본문(서식 있는 HTML)에만 쓰는 제한적 허용 목록 — 문단/제목/강조/목록/이미지 정도만 허용
const ALLOWED_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'img', 'span']
const ALLOWED_ATTR = ['src', 'alt']

/** 지문 본문 HTML을 안전한 부분집합으로 정제한다 (저장 시/렌더 시 이중으로 호출해도 안전, 멱등). */
export function sanitizePassageHtml(html) {
  return DOMPurify.sanitize(html || '', { ALLOWED_TAGS, ALLOWED_ATTR })
}
