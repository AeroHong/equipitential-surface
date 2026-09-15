import React, { createContext, useContext, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from './firebase.js'

import LoginPage from './pages/LoginPage.jsx'
import EssayWritePage from './pages/student/EssayWritePage.jsx'
import EssayAdminHome from './pages/admin/EssayAdminHome.jsx'
import PassageList from './pages/admin/PassageList.jsx'
import PassageEditor from './pages/admin/PassageEditor.jsx'
import AssignmentEditor from './pages/admin/AssignmentEditor.jsx'
import AssignmentDashboard from './pages/admin/AssignmentDashboard.jsx'
import ReplayView from './pages/admin/ReplayView.jsx'

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

function RequireAdmin({ children }) {
  const { user, userRole, loading } = useAuth()
  const location = useLocation()

  if (loading) return <LoadingSpinner />
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  if (userRole !== 'super_admin') return <Navigate to="/" replace />
  return children
}

function RootRedirect() {
  const { user, userRole, loading } = useAuth()

  if (loading) return <LoadingSpinner />
  if (!user) return <Navigate to="/login" replace />
  if (userRole === 'super_admin') return <Navigate to="/admin" replace />

  // 학생은 항상 교사가 공유한 과제 링크(/write/:assignmentId)로 진입하므로 일반 홈이 없다
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 px-4">
      <div className="text-center max-w-sm">
        <p className="text-4xl mb-3">✍️</p>
        <p className="text-gray-700 font-medium mb-1">아직 배정된 과제 링크가 없습니다</p>
        <p className="text-gray-400 text-sm">선생님이 공유한 과제 링크로 접속해주세요.</p>
      </div>
    </div>
  )
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

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
