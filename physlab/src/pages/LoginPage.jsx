import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signInWithPopup } from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db, googleProvider } from '../firebase.js'

// 개발 중에는 도메인 제한 해제 (배포 전 true로 변경)
const ENFORCE_DOMAIN = false
const ALLOWED_DOMAIN = 'seonyoo.hs.kr'

export default function LoginPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleGoogleLogin() {
    setError('')
    setLoading(true)
    try {
      const result = await signInWithPopup(auth, googleProvider)
      const user = result.user
      const email = user.email || ''

      // 이메일 도메인 확인 (ENFORCE_DOMAIN = true일 때만 차단)
      if (ENFORCE_DOMAIN && !email.endsWith(`@${ALLOWED_DOMAIN}`)) {
        await auth.signOut()
        setError(`학교 구글 계정(@${ALLOWED_DOMAIN})으로만 로그인할 수 있습니다.`)
        setLoading(false)
        return
      }

      // Firestore에서 역할 확인 또는 신규 생성
      const userRef = doc(db, 'users', user.uid)
      const userSnap = await getDoc(userRef)

      if (!userSnap.exists()) {
        // 신규 사용자 → student로 생성
        await setDoc(userRef, {
          uid: user.uid,
          email: user.email,
          name: user.displayName || '',
          role: 'student',
          class: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        })
        navigate('/student')
      } else {
        const data = userSnap.data()
        // updatedAt 갱신
        await setDoc(userRef, { updatedAt: serverTimestamp() }, { merge: true })

        if (data.role === 'super_admin') {
          navigate('/admin')
        } else {
          navigate('/student')
        }
      }
    } catch (err) {
      console.error('로그인 오류:', err)
      if (err.code === 'auth/popup-closed-by-user') {
        setError('로그인 창이 닫혔습니다. 다시 시도해주세요.')
      } else if (err.code === 'auth/popup-blocked') {
        setError('팝업이 차단되었습니다. 브라우저 팝업 허용 후 다시 시도해주세요.')
      } else {
        setError('로그인 중 오류가 발생했습니다. 다시 시도해주세요.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm">
        {/* 로고 영역 */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-blue-600 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg">
            <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">PhysLab</h1>
          <p className="text-gray-500 mt-1 text-sm">등전위면 실험 플랫폼</p>
          <p className="text-gray-400 text-xs mt-1">선유고등학교 물리학</p>
        </div>

        {/* 오류 메시지 */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-red-700 text-sm text-center">
            {error}
          </div>
        )}

        {/* 로그인 버튼 */}
        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 bg-white border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 text-gray-700 font-semibold py-3.5 px-6 rounded-xl transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm active:scale-95"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-gray-400 border-t-blue-600 rounded-full animate-spin" />
          ) : (
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
          )}
          {loading ? '로그인 중...' : '구글 계정으로 로그인'}
        </button>

        <p className="text-center text-xs text-gray-400 mt-4">
          학교 구글 계정 <span className="font-mono text-gray-500">@seonyoo.hs.kr</span> 만 이용 가능합니다.
        </p>
      </div>
    </div>
  )
}
