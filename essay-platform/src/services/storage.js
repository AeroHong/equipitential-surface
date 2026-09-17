// smart-teachers-office(apps/shared/lib/requestAttachments.js)의 업로드 로직을 이식.
// schoolId/docId/folder 기반 다중 테넌트 경로 대신, essay-platform 자체 규칙에 맞춰
// essayPassages/{uid}/... 로 단순화했다(storage.rules의 essayPassages/{allPaths=**} 규칙과 일치).
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { auth, storage } from '../firebase.js'

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']

export function isImageFile(file) {
  if (file?.type?.startsWith('image/')) return true
  const ext = (file?.name || '').split('.').pop()?.toLowerCase() || ''
  return IMAGE_EXTENSIONS.includes(ext)
}

function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

/** 저장 경로로 못 쓰는 문자를 정리한다. 한글은 그대로 둔다. */
function safeFileName(name = '') {
  return name.replace(/[/\\?%*:|"<>#]/g, '_').slice(0, 120) || 'file'
}

/**
 * 지문 본문에 끼워 넣는 이미지 한 개를 업로드한다.
 * @param {File} file
 * @returns {Promise<{name, size, path, url}>}
 */
export async function uploadPassageImage(file) {
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(`파일이 너무 큽니다. ${formatBytes(MAX_IMAGE_BYTES)}까지 올릴 수 있습니다.`)
  }
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('로그인이 필요합니다.')

  const path = `essayPassages/${uid}/${Date.now()}_${safeFileName(file.name)}`
  const objectRef = ref(storage, path)
  await uploadBytes(objectRef, file, { contentType: file.type || 'application/octet-stream' })

  return { name: file.name, size: file.size, path, url: await getDownloadURL(objectRef) }
}

/**
 * 학생 답안(EssayEditor)에 끼워 넣는 이미지 한 개를 업로드한다. 경로가 본인 uid로
 * 시작해야 storage.rules(essayAnswers/{uid}/**)를 통과한다.
 * @param {File} file
 * @returns {Promise<{name, size, path, url}>}
 */
export async function uploadAnswerImage(file) {
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(`파일이 너무 큽니다. ${formatBytes(MAX_IMAGE_BYTES)}까지 올릴 수 있습니다.`)
  }
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('로그인이 필요합니다.')

  const path = `essayAnswers/${uid}/${Date.now()}_${safeFileName(file.name)}`
  const objectRef = ref(storage, path)
  await uploadBytes(objectRef, file, { contentType: file.type || 'application/octet-stream' })

  return { name: file.name, size: file.size, path, url: await getDownloadURL(objectRef) }
}
