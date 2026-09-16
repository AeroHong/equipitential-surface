import React, { createContext, useContext, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from './firebase.js'
import { requestTeacherRole } from './services/users.js'

import LoginPage from './pages/LoginPage.jsx'
import EssayWritePage from './pages/student/EssayWritePage.jsx'
import EssayAdminHome from './pages/admin/EssayAdminHome.jsx'
import PassageList from './pages/admin/PassageList.jsx'
import PassageEditor from './pages/admin/PassageEditor.jsx'
import AssignmentEditor from './pages/admin/AssignmentEditor.jsx'
import AssignmentDashboard from './pages/admin/AssignmentDashboard.jsx'
import ReplayView from './pages/admin/ReplayView.jsx'
import TeacherRequests from './pages/admin/TeacherRequests.jsx'

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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser)
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid))
          if (userDoc.exists()) {
            const data = userDoc.data()
            setUserRole(data.role || 'student')
            setUserInfo(data)
          } else {
            setUserRole('student')
            setUserInfo(null)
          }
        } catch (err) {
          console.error('사용자 정보 조회 실패:', err)
          setUserRole('student')
        }
      } else {
        setUser(null)
        setUserRole(null)
        setUserInfo(null)
      }
      setLoading(false)
    })
    return unsubscribe
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

// 교사 권한 요청 승인/거절은 super_admin 전용 — 교사끼리 서로 승인해주는 걸 막는다.
function RequireSuperAdmin({ children }) {
  const { user, userRole, loading } = useAuth()
  const location = useLocation()

  if (loading) return <LoadingSpinner />
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  if (userRole !== 'super_admin') return <Navigate to="/admin" replace />
  return children
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

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 px-4">
      <div className="text-center max-w-sm">
        <p className="text-4xl mb-3">✍️</p>
        <p className="text-gray-700 font-medium mb-1">아직 배정된 과제 링크가 없습니다</p>
        <p className="text-gray-400 text-sm mb-6">선생님이 공유한 과제 링크로 접속해주세요.</p>

        {requested ? (
          <p className="text-sm text-indigo-600 bg-indigo-50 rounded-xl px-4 py-3">
            교사 권한을 요청했습니다. 관리자 승인을 기다려주세요.
          </p>
        ) : (
          <>
            <button
              onClick={handleRequest}
              disabled={requesting}
              className="text-sm text-indigo-600 hover:text-indigo-800 underline underline-offset-2 disabled:opacity-50"
            >
              {requesting ? '요청 중...' : '선생님이신가요? 교사 권한 요청하기'}
            </button>
            {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
          </>
        )}
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

          <Route path="/admin" element={<RequireAdmin><EssayAdminHome /></RequireAdmin>} />
          <Route path="/admin/passages" element={<RequireAdmin><PassageList /></RequireAdmin>} />
          <Route path="/admin/passages/new" element={<RequireAdmin><PassageEditor /></RequireAdmin>} />
          <Route path="/admin/passages/:passageId/edit" element={<RequireAdmin><PassageEditor /></RequireAdmin>} />
          <Route path="/admin/assignments/new" element={<RequireAdmin><AssignmentEditor /></RequireAdmin>} />
          <Route path="/admin/assignments/:assignmentId/edit" element={<RequireAdmin><AssignmentEditor /></RequireAdmin>} />
          <Route path="/admin/assignments/:assignmentId" element={<RequireAdmin><AssignmentDashboard /></RequireAdmin>} />
          <Route path="/admin/assignments/:assignmentId/student/:uid" element={<RequireAdmin><ReplayView /></RequireAdmin>} />
          <Route path="/admin/teachers" element={<RequireSuperAdmin><TeacherRequests /></RequireSuperAdmin>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
