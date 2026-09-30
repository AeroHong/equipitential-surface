import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from './firebase.js'
import { requestTeacherRole, clearStaffManualIdentity } from './services/users.js'

import LoginPage from './pages/LoginPage.jsx'
import EssayWritePage from './pages/student/EssayWritePage.jsx'
import EssayAdminHome from './pages/admin/EssayAdminHome.jsx'
import SuperAdminHome from './pages/admin/SuperAdminHome.jsx'
import PassageList from './pages/admin/PassageList.jsx'
import PassageEditor from './pages/admin/PassageEditor.jsx'
import AssignmentEditor from './pages/admin/AssignmentEditor.jsx'
import AssignmentDashboard from './pages/admin/AssignmentDashboard.jsx'
import ReplayView from './pages/admin/ReplayView.jsx'
import TemplateList from './pages/admin/templates/TemplateList.jsx'
import TemplateEditor from './pages/admin/templates/TemplateEditor.jsx'
import QuestionSetEditor from './pages/admin/templates/QuestionSetEditor.jsx'
import HelpPage from './pages/admin/HelpPage.jsx'
import TeacherRequestCard from './components/TeacherRequestCard.jsx'

// ─── Auth Context (physlab의 App.jsx와 동일한 패턴 — 같은 Firebase 프로젝트를 쓰므로 users/{uid}.role도 그대로 통한다) ──
export const AuthContext = createContext(null)

export function useAuth() {
  return useContext(AuthContext)
}

function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [userRole, setUserRole] = useState(null)
  const [userInfo, setUserInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const identityRepairTriedRef = useRef(false)

  useEffect(() => {
    // users/{uid}를 실시간 구독한다(예전엔 로그인 시 한 번만 getDoc으로 읽었다) — super_admin이
    // 교사 권한을 승인/거절/해제하면, 그 계정으로 로그인해 대기 화면을 보고 있던 사람의
    // 화면이 새로고침 없이 바로 다음 화면(교사 홈 등)으로 넘어가게 하기 위함.
    let unsubscribeUserDoc = null
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      unsubscribeUserDoc?.()
      unsubscribeUserDoc = null
      if (firebaseUser) {
        setUser(firebaseUser)
        unsubscribeUserDoc = onSnapshot(
          doc(db, 'users', firebaseUser.uid),
          snap => {
            if (snap.exists()) {
              const data = snap.data()
              // 교사/관리자가 학생 화면을 테스트하다 학번·이름 입력창에 적은 값이 name을 덮어쓴
              // 경우(예전 버그) 한 번 자동으로 되돌린다 — EssayWritePage는 이제 교직원에겐 묻지 않는다.
              const isStaff = data.role === 'teacher' || data.role === 'super_admin' || data.role === 'teacher_pending'
              if (isStaff && data.manualIdentity && !identityRepairTriedRef.current) {
                identityRepairTriedRef.current = true
                clearStaffManualIdentity(firebaseUser.uid, firebaseUser.displayName)
                  .catch(err => console.error('교직원 계정 이름 복구 실패:', err))
              }
              setUserRole(data.role || 'student')
              setUserInfo(data)
            } else {
              setUserRole('student')
              setUserInfo(null)
            }
            setLoading(false)
          },
          err => {
            console.error('사용자 정보 구독 실패:', err)
            setUserRole('student')
            setLoading(false)
          }
        )
      } else {
        setUser(null)
        setUserRole(null)
        setUserInfo(null)
        setLoading(false)
      }
    })
    return () => {
      unsubscribeAuth()
      unsubscribeUserDoc?.()
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, userRole, userInfo, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

// ─── Route Guards ────────────────────────────────────────────
function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <LoadingSpinner />
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  return children
}

// 교사(teacher)와 관리자(super_admin) 모두 /admin/* 접근 가능 — essay-platform 안에서만
// 유효한 권한이다(교사로 승인돼도 physlab의 실험 관리자 화면엔 못 들어간다, 별개 role 체크).
function RequireAdmin({ children }) {
  const { user, userRole, loading } = useAuth()
  const location = useLocation()

  if (loading) return <LoadingSpinner />
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  if (userRole !== 'super_admin' && userRole !== 'teacher') return <Navigate to="/" replace />
  return children
}

// 지문/배정/양식을 직접 만들고 관리하는 화면은 이제 teacher 전용이다 — super_admin은
// "지문 생성/배정" 같은 실무가 아니라 교사 계정 관리(SuperAdminHome)만 한다. URL을 직접
// 알아도 super_admin이 이 화면들에 들어오면 /admin(자신의 관리자 홈)으로 돌려보낸다.
function RequireTeacherOnly({ children }) {
  const { user, userRole, loading } = useAuth()
  const location = useLocation()

  if (loading) return <LoadingSpinner />
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  if (userRole !== 'teacher') return <Navigate to="/admin" replace />
  return children
}

/** /admin은 역할에 따라 완전히 다른 화면이다 — teacher는 배정 목록(EssayAdminHome),
 * super_admin은 교사 계정 관리 중심의 전용 홈(SuperAdminHome). */
function AdminHome() {
  const { userRole } = useAuth()
  return userRole === 'super_admin' ? <SuperAdminHome /> : <EssayAdminHome />
}

/** 아직 교사 권한이 없는 로그인 사용자(학생 기본값) — 과제 링크가 없다는 안내 + 권한 요청 버튼. */
function StudentHome() {
  const { user } = useAuth()
  const [requested, setRequested] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [error, setError] = useState('')

  async function handleRequest() {
    setRequesting(true)
    setError('')
    try {
      await requestTeacherRole(user.uid)
      setRequested(true)
    } catch (err) {
      console.error('교사 권한 요청 실패:', err)
      setError('요청 중 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setRequesting(false)
    }
  }

  // 선생님이 처음 로그인하면 가장 먼저 해야 할 일이 교사 권한 요청이라 크게 보여주고,
  // 학생용 안내("과제 링크로 접속")는 그 아래에 작게 둔다.
  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-indigo-50 via-white to-violet-50 px-4 py-10">
      <div className="w-full max-w-md space-y-4">
        <TeacherRequestCard
          state={requested ? 'requested' : requesting ? 'requesting' : 'idle'}
          error={error}
          onRequest={handleRequest}
        />
        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4 text-center">
          <p className="text-sm font-medium text-gray-700">✍️ 학생인가요?</p>
          <p className="mt-0.5 text-xs text-gray-400">선생님이 공유한 과제 링크로 접속하면 바로 작성 화면이 열립니다.</p>
        </div>
        <p className="text-center">
          <Link to="/help" className="text-sm text-indigo-600 underline underline-offset-2 hover:text-indigo-800">📖 사용법 보기</Link>
        </p>
      </div>
    </div>
  )
}

/** 교사 권한 요청 후 승인 대기 중인 사용자에게 보여주는 화면. */
function PendingApproval() {
  const { user, userInfo } = useAuth()
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 px-4">
      <div className="text-center max-w-sm">
        <p className="text-4xl mb-3">⏳</p>
        <p className="text-gray-700 font-medium mb-1">교사 권한 승인 대기 중입니다</p>
        <p className="text-gray-400 text-sm">
          {userInfo?.name || user?.displayName || user?.email}님의 요청을 관리자가 확인하면 이용하실 수 있어요.
        </p>
        <Link to="/help" className="mt-4 inline-block text-sm text-indigo-600 underline underline-offset-2 hover:text-indigo-800">📖 기다리는 동안 사용법 보기</Link>
      </div>
    </div>
  )
}

function RootRedirect() {
  const { user, userRole, loading } = useAuth()

  if (loading) return <LoadingSpinner />
  if (!user) return <Navigate to="/login" replace />
  if (userRole === 'super_admin' || userRole === 'teacher') return <Navigate to="/admin" replace />
  if (userRole === 'teacher_pending') return <PendingApproval />

  // 학생은 항상 교사가 공유한 과제 링크(/write/:assignmentId)로 진입하므로 일반 홈이 없다
  return <StudentHome />
}

// ─── App ─────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<LoginPage />} />

          <Route path="/write/:assignmentId" element={<RequireAuth><EssayWritePage /></RequireAuth>} />

          <Route path="/admin" element={<RequireAdmin><AdminHome /></RequireAdmin>} />
          {/* 사용법은 로그인·교사 승인 없이도 볼 수 있다 — 승인 전인 선생님이 미리 읽어볼 수 있게. */}
          <Route path="/help" element={<HelpPage />} />
          <Route path="/admin/passages" element={<RequireTeacherOnly><PassageList /></RequireTeacherOnly>} />
          <Route path="/admin/passages/new" element={<RequireTeacherOnly><PassageEditor /></RequireTeacherOnly>} />
          <Route path="/admin/passages/:passageId/edit" element={<RequireTeacherOnly><PassageEditor /></RequireTeacherOnly>} />
          <Route path="/admin/assignments/new" element={<RequireTeacherOnly><AssignmentEditor /></RequireTeacherOnly>} />
          <Route path="/admin/assignments/:assignmentId/edit" element={<RequireTeacherOnly><AssignmentEditor /></RequireTeacherOnly>} />
          <Route path="/admin/assignments/:assignmentId" element={<RequireTeacherOnly><AssignmentDashboard /></RequireTeacherOnly>} />
          <Route path="/admin/assignments/:assignmentId/student/:uid" element={<RequireTeacherOnly><ReplayView /></RequireTeacherOnly>} />
          <Route path="/admin/templates" element={<RequireTeacherOnly><TemplateList /></RequireTeacherOnly>} />
          <Route path="/admin/templates/new" element={<RequireTeacherOnly><TemplateEditor /></RequireTeacherOnly>} />
          <Route path="/admin/templates/:templateId/edit" element={<RequireTeacherOnly><TemplateEditor /></RequireTeacherOnly>} />
          <Route path="/admin/question-sets" element={<RequireTeacherOnly><TemplateList key="question_set" kind="question_set" /></RequireTeacherOnly>} />
          <Route path="/admin/question-sets/new" element={<RequireTeacherOnly><QuestionSetEditor /></RequireTeacherOnly>} />
          <Route path="/admin/question-sets/:templateId/edit" element={<RequireTeacherOnly><QuestionSetEditor /></RequireTeacherOnly>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
