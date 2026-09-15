// Google Classroom 연동 — Firebase Auth(로그인/식별)와는 별개로,
// 교사가 명시적으로 "Classroom에 게시"를 누를 때만 Google Identity Services(GIS)로
// 별도 access token을 발급받아 클라이언트에서 직접 Classroom API를 호출한다(서버/백엔드 불필요).
// ai-grading-system의 classroomService.ts 구조를 이식(모듈 레벨 토큰, 만료 전 조용한 자동 갱신).

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const DISCOVERY_DOC = 'https://classroom.googleapis.com/$discovery/rest?version=v1'
const SCOPES = [
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.students'
].join(' ')

let accessToken = null
let tokenExpiresAt = 0
let tokenClient = null
let gapiInited = false
let refreshTimer = null

/** 환경변수(VITE_GOOGLE_CLIENT_ID)가 설정되어 있는지 여부 — UI에서 게시 버튼 활성/비활성 판단용 */
export function hasClassroomConfig() {
  return Boolean(CLIENT_ID)
}

/** 현재 유효한 access token을 보유하고 있는지 (재로그인 필요 여부 판단용) */
export function isClassroomConnected() {
  return Boolean(accessToken) && Date.now() < tokenExpiresAt
}

export function getAccessToken() {
  return accessToken
}

/** Google API 오류 객체를 교사가 바로 조치할 수 있는 메시지로 변환한다. */
export function getClassroomErrorMessage(err, action = '연결') {
  const apiError = err?.result?.error || err?.response?.result?.error
  const code = apiError?.code || err?.code
  const detail = apiError?.message || err?.message || '알 수 없는 오류'

  if (code === 401 || /insufficient.*scope|invalid.*credential/i.test(detail)) {
    return `Classroom 권한이 충분하지 않습니다. 다시 연결한 뒤 권한 요청을 승인해주세요. (${detail})`
  }
  if (code === 403 || /permission.*denied|not.*permitted/i.test(detail)) {
    return action === '게시'
      ? `과제를 게시할 권한이 없습니다. 연결한 Google 계정이 선택한 수업의 교사인지 확인해주세요. 도메인 관리자만으로는 게시할 수 없습니다. (${detail})`
      : `Classroom 접근 권한이 없습니다. (${detail})`
  }
  return detail
}

function loadGapiClient() {
  return new Promise((resolve, reject) => {
    if (typeof window.gapi === 'undefined') {
      reject(new Error('Google API 스크립트가 로드되지 않았습니다. index.html의 apis.google.com/js/api.js 태그를 확인하세요.'))
      return
    }
    window.gapi.load('client', async () => {
      try {
        await window.gapi.client.init({ discoveryDocs: [DISCOVERY_DOC] })
        gapiInited = true
        resolve()
      } catch (err) {
        reject(err)
      }
    })
  })
}

function ensureTokenClient() {
  if (tokenClient) return tokenClient
  if (typeof window.google === 'undefined') {
    throw new Error('Google Identity Services 스크립트가 로드되지 않았습니다. index.html의 accounts.google.com/gsi/client 태그를 확인하세요.')
  }
  if (!CLIENT_ID) {
    throw new Error('VITE_GOOGLE_CLIENT_ID 환경변수가 설정되지 않았습니다.')
  }
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: () => {} // signInToClassroom 호출 시마다 override
  })
  return tokenClient
}

function scheduleAutoRefresh(expiresInSec) {
  if (refreshTimer) clearTimeout(refreshTimer)
  const refreshInMs = Math.max((expiresInSec - 300) * 1000, 10000)
  refreshTimer = setTimeout(() => {
    ensureTokenClient().requestAccessToken({ prompt: '' })
  }, refreshInMs)
}

/**
 * Classroom OAuth 로그인. 최초 1회는 동의화면(prompt:'consent')이 뜨고,
 * 이후 재호출(토큰 만료 임박 등)은 조용히(prompt:'') 갱신한다.
 * @returns {Promise<string>} access token
 */
export async function signInToClassroom() {
  if (!gapiInited) await loadGapiClient()
  const client = ensureTokenClient()
  const alreadyConnected = isClassroomConnected()

  return new Promise((resolve, reject) => {
    client.callback = (resp) => {
      if (resp.error) {
        reject(new Error(resp.error))
        return
      }
      accessToken = resp.access_token
      const expiresIn = Number(resp.expires_in || 3600)
      tokenExpiresAt = Date.now() + expiresIn * 1000
      window.gapi.client.setToken({ access_token: accessToken })
      scheduleAutoRefresh(expiresIn)
      resolve(accessToken)
    }
    // Firebase 로그인 계정과 Classroom 교사 계정이 다를 수 있으므로 첫 연결에서는
    // Google 계정 선택기를 항상 표시한다.
    client.requestAccessToken({ prompt: alreadyConnected ? '' : 'select_account consent' })
  })
}

/**
 * 교사 본인이 담당(teacherId: 'me')하는 활성 수업 목록 조회
 * @returns {Promise<Array>}
 */
export async function listMyCourses() {
  const res = await window.gapi.client.classroom.courses.list({
    teacherId: 'me',
    courseStates: ['ACTIVE']
  })
  return res.result.courses || []
}

/**
 * 선택한 수업에 실제 과제(courseWork)를 게시
 * @param {string} courseId
 * @param {{title: string, description: string, linkUrl: string, dueDate?: Date}} params
 * @returns {Promise<object>} 생성된 courseWork
 */
export async function createCourseWork(courseId, { title, description, linkUrl, dueDate }) {
  const body = {
    title,
    description,
    workType: 'ASSIGNMENT',
    state: 'PUBLISHED',
    materials: [{ link: { url: linkUrl } }]
  }
  if (dueDate) {
    body.dueDate = {
      year: dueDate.getFullYear(),
      month: dueDate.getMonth() + 1,
      day: dueDate.getDate()
    }
    // Classroom API는 dueDate와 dueTime을 반드시 함께 설정해야 한다.
    // 앱의 날짜 입력은 시간 없이 받으므로 해당 날짜의 마지막 시각으로 처리한다.
    body.dueTime = { hours: 23, minutes: 59 }
  }
  const res = await window.gapi.client.classroom.courses.courseWork.create({
    courseId,
    resource: body
  })
  return res.result
}
