import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { auth, storage } from '../firebase.js'

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
    .replace(/\u00a0/g, ' ')
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

/** DOCX의 텍스트와 내장 이미지를 지문 입력값으로 변환한다. */
export async function importPassageDocx(file) {
  if (!file?.name?.toLowerCase().endsWith('.docx')) {
    throw new Error('DOCX 파일만 불러올 수 있습니다.')
  }

  const arrayBuffer = await file.arrayBuffer()
  // DOCX를 쓰지 않는 학생 화면에는 파서 코드가 내려가지 않도록 필요할 때만 불러온다.
  const { default: mammoth } = await import('mammoth')
  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      convertImage: mammoth.images.inline(async (image) => {
        const base64 = await image.read('base64')
        return { src: `data:${image.contentType};base64,${base64}` }
      })
    }
  )

  const container = document.createElement('div')
  container.innerHTML = result.value
  const imageDataUrls = Array.from(container.querySelectorAll('img'))
    .map((image) => image.getAttribute('src'))
    .filter((src) => src?.startsWith('data:image/'))
  const imageUrls = await Promise.all(
    imageDataUrls.map((dataUrl, index) => uploadImage(dataUrl, index + 1))
  )

  return {
    title: fileTitle(file.name),
    bodyText: htmlToText(result.value),
    imageUrls,
    warnings: result.messages.map((message) => message.message)
  }
}
