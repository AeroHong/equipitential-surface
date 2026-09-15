import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { auth, storage } from '../firebase.js'
import { sanitizePassageHtml } from '../utils/sanitizeHtml.js'

const imageExtensions = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg'
}

function fileTitle(name) {
  return name.replace(/\.docx$/i, '').replace(/[_-]+/g, ' ').trim()
}

function htmlToText(html) {
  const container = document.createElement('div')
  container.innerHTML = html
  return (container.innerText || container.textContent || '')
    .replace(/ /g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function uploadImage(dataUrl, index) {
  const response = await fetch(dataUrl)
  const blob = await response.blob()
  const extension = imageExtensions[blob.type] || 'bin'
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('로그인이 필요합니다.')

  const objectRef = ref(storage, `essayPassages/${uid}/${Date.now()}-${index}.${extension}`)
  await uploadBytes(objectRef, blob, { contentType: blob.type })
  return getDownloadURL(objectRef)
}

/**
 * DOCX의 문단/제목/강조 서식과 내장 이미지를 지문 입력값으로 변환한다.
 * 이미지는 mammoth가 변환하는 시점에 바로 Storage로 업로드해 본문 HTML 안에 제자리로 들어가게 한다
 * (별도 목록으로 분리하지 않음 — 문서에서 보이던 위치 그대로 유지하기 위함).
 */
export async function importPassageDocx(file) {
  if (!file?.name?.toLowerCase().endsWith('.docx')) {
    throw new Error('DOCX 파일만 불러올 수 있습니다.')
  }

  const arrayBuffer = await file.arrayBuffer()
  // DOCX를 쓰지 않는 학생 화면에는 파서 코드가 내려가지 않도록 필요할 때만 불러온다.
  const { default: mammoth } = await import('mammoth')
  let imageIndex = 0
  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      convertImage: mammoth.images.inline(async (image) => {
        const base64 = await image.read('base64')
        const dataUrl = `data:${image.contentType};base64,${base64}`
        const url = await uploadImage(dataUrl, ++imageIndex)
        return { src: url }
      })
    }
  )

  const bodyHtml = sanitizePassageHtml(result.value)

  return {
    title: fileTitle(file.name),
    bodyHtml,
    bodyText: htmlToText(result.value),
    warnings: result.messages.map((message) => message.message)
  }
}
