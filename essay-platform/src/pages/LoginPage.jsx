import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { signInWithPopup } from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db, googleProvider } from '../firebase.js'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleGoogleLogin() {
    setError('')
    setLoading(true)
    try {
      const result = await signInWithPopup(auth, googleProvider)
      const user = result.user

      // 학교 도메인 제한은 두지 않는다 — 개인 계정으로 들어온 학생은 로그인 자체는
      // 허용하고, 과제 화면(EssayWritePage)에서 학번·이름을 따로 받아 본인 확인을 한다.
      // Firestore users 컬렉션은 physlab과 공유 — 없으면 student로 신규 생성
      const userRef = doc(db, 'users', user.uid)
      const userSnap = await getDoc(userRef)
      const from = location.state?.from?.pathname

      if (!userSnap.exists()) {
        await setDoc(userRef, {
          uid: user.uid,
          email: user.email,
          name: user.displayName || '',
          role: 'student',
          class: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        })
      } else {
        await setDoc(userRef, { updatedAt: serverTimestamp() }, { merge: true })
      }

      // RootRedirect가 role에 따라 /admin 또는 안내 화면으로 보내주므로 '/'로 통일
      navigate(from || '/')
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
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-indigo-800 to-purple-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-indigo-600 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg text-4xl">
            ✍️
          </div>
          <h1 className="text-2xl font-bold text-gray-900">서술형 수행평가</h1>
          <p className="text-gray-500 mt-1 text-sm">물리학Ⅱ 작성 플랫폼</p>
          <p className="text-gray-400 text-xs mt-1">선유고등학교 물리학</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-red-700 text-sm text-center">
            {error}
          </div>
        )}

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 bg-white border-2 border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 text-gray-700 font-semibold py-3.5 px-6 rounded-xl transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm active:scale-95"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-gray-400 border-t-indigo-600 rounded-full animate-spin" />
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
      </div>
    </div>
  )
}
