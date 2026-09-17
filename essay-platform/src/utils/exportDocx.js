// 리플레이 화면 왼쪽 "전체 작성 내용"을 교사가 기록/채점용으로 내려받을 수 있게 DOCX로
// 변환한다. 학생 답안은 contentEditable에서 나온 얕은 HTML(굵게/기울임/밑줄/취소선/목록/
// 이미지)뿐이라 범용 HTML→docx 변환기 없이 직접 걸어도 충분하다.
import { Document, Packer, Paragraph, TextRun, ImageRun, ExternalHyperlink, HeadingLevel } from 'docx'

async function fetchImageData(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    const buf = await blob.arrayBuffer()
    let type = (blob.type || '').split('/')[1] || 'png'
    if (type === 'jpeg') type = 'jpg'
    if (!['png', 'jpg', 'gif', 'bmp'].includes(type)) type = 'png'
    return { data: new Uint8Array(buf), type }
  } catch {
    return null
  }
}

function getImageNaturalSize(url) {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth || 400, height: img.naturalHeight || 300 })
    img.onerror = () => resolve({ width: 400, height: 300 })
    img.src = url
  })
}

async function imageParagraph(src, alt) {
  if (!src) return new Paragraph({ children: [new TextRun({ text: '[이미지]', italics: true })] })
  const [imgData, natural] = await Promise.all([fetchImageData(src), getImageNaturalSize(src)])
  // Storage 버킷 CORS 설정에 따라 fetch가 막힐 수 있다 — 그럴 땐 이미지를 그대로 문서에
  // 못 넣으니, 대신 원본을 열어볼 수 있는 링크만 남긴다(내용 자체가 사라지진 않게).
  if (!imgData) {
    return new Paragraph({
      children: [new ExternalHyperlink({
        link: src,
        children: [new TextRun({ text: `[이미지: ${alt || '원본 보기'}]`, style: 'Hyperlink' })]
      })]
    })
  }
  const maxWidth = 500
  const scale = natural.width > maxWidth ? maxWidth / natural.width : 1
  return new Paragraph({
    children: [new ImageRun({
      data: imgData.data,
      type: imgData.type,
      transformation: { width: Math.round(natural.width * scale), height: Math.round(natural.height * scale) }
    })]
  })
}

/** HTML(답안 서식) 조각을 docx Paragraph 배열로 변환한다. */
async function htmlToDocxParagraphs(html) {
  const container = document.createElement('div')
  container.innerHTML = html || ''
  const paragraphs = []
  let currentRuns = []

  function flush() {
    if (currentRuns.length) {
      paragraphs.push(new Paragraph({ children: currentRuns }))
      currentRuns = []
    }
  }

  async function walk(node, style) {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        if (child.textContent) {
          currentRuns.push(new TextRun({
            text: child.textContent,
            bold: style.bold,
            italics: style.italic,
            underline: style.underline ? {} : undefined,
            strike: style.strike
          }))
        }
        continue
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue
      const tag = child.tagName.toLowerCase()

      if (tag === 'br') { flush(); continue }
      if (tag === 'img') {
        flush()
        paragraphs.push(await imageParagraph(child.getAttribute('src'), child.getAttribute('alt')))
        continue
      }
      if (tag === 'ul' || tag === 'ol') {
        flush()
        let idx = 1
        for (const li of Array.from(child.children)) {
          if (li.tagName?.toLowerCase() !== 'li') continue
          currentRuns.push(new TextRun({ text: tag === 'ol' ? `${idx}. ` : '• ' }))
          await walk(li, style)
          flush()
          idx++
        }
        continue
      }
      if (tag === 'p' || tag === 'div') {
        await walk(child, style)
        flush()
        continue
      }
      const nextStyle = { ...style }
      if (tag === 'b' || tag === 'strong') nextStyle.bold = true
      if (tag === 'i' || tag === 'em') nextStyle.italic = true
      if (tag === 'u') nextStyle.underline = true
      if (tag === 's' || tag === 'strike') nextStyle.strike = true
      await walk(child, nextStyle)
    }
  }

  await walk(container, {})
  flush()
  return paragraphs.length ? paragraphs : [new Paragraph({ children: [new TextRun('(작성 내용 없음)')] })]
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * 학생 답안 전체를 DOCX로 내려받는다.
 * @param {object} params
 * @param {string} params.title 문서 제목(배정 제목)
 * @param {string} params.studentName
 * @param {Array<{groupLabel?: string, heading?: string, html: string}>} params.sections
 *   essay 타입은 섹션 하나짜리 배열로 넘기면 된다.
 */
export async function exportAnswerToDocx({ title, studentName, sections }) {
  const children = [
    new Paragraph({ text: title || '답안', heading: HeadingLevel.HEADING_1 })
  ]
  if (studentName) children.push(new Paragraph({ text: studentName, heading: HeadingLevel.HEADING_3 }))

  let lastGroup = null
  for (const sec of sections) {
    if (sec.groupLabel && sec.groupLabel !== lastGroup) {
      children.push(new Paragraph({ text: sec.groupLabel, heading: HeadingLevel.HEADING_2 }))
      lastGroup = sec.groupLabel
    }
    if (sec.heading) children.push(new Paragraph({ text: sec.heading, heading: HeadingLevel.HEADING_3 }))
    children.push(...await htmlToDocxParagraphs(sec.html))
  }

  const doc = new Document({ sections: [{ properties: {}, children }] })
  const blob = await Packer.toBlob(doc)
  downloadBlob(blob, `${(studentName ? `${studentName}_` : '') + (title || '답안')}.docx`)
}
