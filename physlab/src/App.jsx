import React, { createContext, useContext, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from './firebase.js'

import LoginPage from './pages/LoginPage.jsx'
import ExperimentSelect from './pages/student/ExperimentSelect.jsx'
import ProfileSetup from './pages/student/ProfileSetup.jsx'
import Step1Input from './pages/student/Step1Input.jsx'
import Step2Drawing from './pages/student/Step2Drawing.jsx'
import Step3Result from './pages/student/Step3Result.jsx'
import Dashboard from './pages/admin/Dashboard.jsx'
import StudentView from './pages/admin/StudentView.jsx'
import SetupAdmin from './pages/SetupAdmin.jsx'

// ─── Auth Context ────────────────────────────────────────────
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

// ─── Route Guards ────────────────────────────────────────────
function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">로딩 중...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return children
}

function RequireAdmin({ children }) {
  const { user, userRole, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (userRole !== 'super_admin') {
    return <Navigate to="/student" replace />
  }

  return children
}

function RootRedirect() {
  const { user, userRole, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (userRole === 'super_admin') return <Navigate to="/admin" replace />
  return <Navigate to="/student" replace />
}

// ─── App ─────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<LoginPage />} />

          {/* 학생 라우트 */}
          <Route
            path="/student/profile"
            element={
              <RequireAuth>
                <ProfileSetup />
              </RequireAuth>
            }
          />
          <Route
            path="/student"
            element={
              <RequireAuth>
                <ExperimentSelect />
              </RequireAuth>
            }
          />
          <Route
            path="/student/session/:sessionId/step1"
            element={
              <RequireAuth>
                <Step1Input />
              </RequireAuth>
            }
          />
          <Route
            path="/student/session/:sessionId/step2"
            element={
              <RequireAuth>
                <Step2Drawing />
              </RequireAuth>
            }
          />
          <Route
            path="/student/session/:sessionId/step3"
            element={
              <RequireAuth>
                <Step3Result />
              </RequireAuth>
            }
          />

          {/* 관리자 라우트 */}
          <Route
            path="/admin"
            element={
              <RequireAdmin>
                <Dashboard />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/student/:uid"
            element={
              <RequireAdmin>
                <StudentView />
              </RequireAdmin>
            }
          />

          {/* 일회성 어드민 설정 — 배포 전 제거 */}
          <Route path="/setup-admin" element={<RequireAuth><SetupAdmin /></RequireAuth>} />

          {/* 알 수 없는 경로 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
