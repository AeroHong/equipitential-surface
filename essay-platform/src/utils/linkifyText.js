// 교사가 평문으로 입력한 짧은 안내문(보고서 양식 설명 등)에 링크를 쓸 수 있게 해준다.

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * 평문을 안전한 HTML로 바꾼다 — "[설명](https://...)" 형식이나 URL을 그대로 써도 둘 다
 * 클릭 가능한 링크로 바뀐다. 평문 전체를 먼저 이스케이프한 뒤 링크 패턴만 <a>로 되살리는
 * 순서라, 입력한 다른 텍스트가 HTML로 해석되는 일은 없다(dangerouslySetInnerHTML로 그려도 안전).
 * @param {string} text
 * @returns {string}
 */
export function linkifyText(text) {
  if (!text) return ''
  const escaped = escapeHtml(text)
  return escaped.replace(
    /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+)/g,
    (match, linkText, linkUrl, bareUrl) => {
      const url = linkUrl || bareUrl
      const label = linkText || bareUrl
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-indigo-600 underline hover:text-indigo-700">${label}</a>`
    }
  )
}
