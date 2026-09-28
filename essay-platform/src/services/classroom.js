// Google Classroom 연동 — Firebase Auth(로그인/식별)와는 별개로,
// 교사가 명시적으로 "Classroom에 게시"를 누를 때만 Google Identity Services(GIS)로
// 별도 access token을 발급받아 클라이언트에서 직접 Classroom API를 호출한다(서버/백엔드 불필요).
// ai-grading-system의 classroomService.ts 구조를 이식(모듈 레벨 토큰, 만료 전 조용한 자동 갱신).

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const DISCOVERY_DOC = 'https://classroom.googleapis.com/$discovery/rest?version=v1'
const SCOPES = [
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.students',
  // 수업 학생 수 조회(courses.students.list, getCourseStudentCount)에 필요 — 명단 자체는
  // 안 쓰고 개수만 쓰지만, Classroom API는 로스터 조회에 이 스코프를 요구한다.
  'https://www.googleapis.com/auth/classroom.rosters.readonly'
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
 * 수업에 등록된 학생 수. 목록 API가 최대 페이지 크기 제한이 있어 nextPageToken을 따라
 * 끝까지 순회한다(학생 명단 자체는 필요 없고 개수만 필요하므로 페이지별 길이만 합산).
 * @param {string} courseId
 * @returns {Promise<number>}
 */
export async function getCourseStudentCount(courseId) {
  let count = 0
  let pageToken = ''
  do {
    const res = await window.gapi.client.classroom.courses.students.list({
      courseId,
      pageSize: 100,
      pageToken: pageToken || undefined
    })
    count += (res.result.students || []).length
    pageToken = res.result.nextPageToken || ''
  } while (pageToken)
  return count
}

/**
 * 수업에 등록된 학생 명단(이메일 포함). getCourseStudentCount와 같은 페이지네이션 패턴이지만,
 * 개수만이 아니라 이메일까지 보존한다 — 대시보드에서 제출물을 "어느 반 학생인지"로 묶어
 * 보여줄 때(반별 로스터 이메일 ↔ essaySubmissions.studentEmail 매칭) 쓴다.
 * @param {string} courseId
 * @returns {Promise<Array<{userId: string, email: string, name: string}>>}
 */
export async function listCourseStudents(courseId) {
  const students = []
  let pageToken = ''
  do {
    const res = await window.gapi.client.classroom.courses.students.list({
      courseId,
      pageSize: 100,
      pageToken: pageToken || undefined
    })
    for (const s of res.result.students || []) {
      students.push({
        userId: s.userId,
        email: (s.profile?.emailAddress || '').toLowerCase(),
        name: s.profile?.name?.fullName || ''
      })
    }
    pageToken = res.result.nextPageToken || ''
  } while (pageToken)
  return students
}

/**
 * 선택한 수업에 실제 과제(courseWork)를 게시. scheduledAt을 주면 그 시각까지는 Classroom에
 * DRAFT(초안)로만 남아있다가 Classroom이 알아서 그 시각에 자동으로 학생들에게 공개한다
 * (Classroom API의 state: 'DRAFT' + scheduledTime 조합 — 우리 쪽에서 별도로 다시 호출할
 * 필요가 없다).
 * @param {string} courseId
 * @param {{title: string, description: string, linkUrl: string, dueDate?: Date, scheduledAt?: Date}} params
 * @returns {Promise<object>} 생성된 courseWork
 */
export async function createCourseWork(courseId, { title, description, linkUrl, dueDate, scheduledAt }) {
  const body = {
    title,
    description,
    workType: 'ASSIGNMENT',
    materials: [{ link: { url: linkUrl } }]
  }
  if (scheduledAt) {
    body.state = 'DRAFT'
    body.scheduledTime = scheduledAt.toISOString()
  } else {
    body.state = 'PUBLISHED'
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

/**
 * 이미 게시된 courseWork의 설명(description)만 다시 써서 덮어쓴다. 코드에서 게시 문구
 * 템플릿을 바꿔도(예: 과목명 문구 제거) 이미 Classroom에 게시된 기존 과제는 게시 당시
 * 저장된 문구가 그대로 남아있으므로, 필요하면 이 함수로 다시 동기화한다.
 * @param {string} courseId
 * @param {string} courseWorkId
 * @param {string} description
 */
export async function updateCourseWorkDescription(courseId, courseWorkId, description) {
  await window.gapi.client.classroom.courses.courseWork.patch({
    courseId,
    id: courseWorkId,
    updateMask: 'description',
    resource: { description }
  })
}

/**
 * courseWork가 Classroom에 아직 남아있는지 확인한다. 교사가 Classroom에서 과제를 직접
 * 삭제해도 우리 쪽(assignment.classrooms)에는 알림이 오지 않아서, 대시보드가 이걸로
 * 대조해 삭제된 연결을 걷어낸다. Classroom에서 삭제한 과제는 바로 404가 되지 않고 한동안
 * state: 'DELETED'로 조회된다(교사에게만 보임, 실제로 이 때문에 삭제를 못 잡은 적 있음) —
 * 그래서 404와 DELETED 둘 다 "삭제됨"으로 본다. 권한·네트워크 오류는 그대로 던진다 —
 * 일시적인 오류로 멀쩡한 연결을 지우면 안 되기 때문.
 * @param {string} courseId
 * @param {string} courseWorkId
 * @returns {Promise<boolean>}
 */
export async function courseWorkExists(courseId, courseWorkId) {
  try {
    const res = await window.gapi.client.classroom.courses.courseWork.get({ courseId, id: courseWorkId })
    return res.result?.state !== 'DELETED'
  } catch (err) {
    const code = err?.status || err?.result?.error?.code
    if (code === 404) return false
    if (err?.result?.error?.status === 'NOT_FOUND') return false
    throw err
  }
}
