import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase.js'
import { useAuth } from '../App.jsx'

/**
 * 일회성 super_admin 설정 페이지
 * /setup-admin 로 접근 — 배포 전 이 라우트를 제거하세요.
 */
export default function SetupAdmin() {
  const { user } = useAuth()
  const navigate  = useNavigate()
  const [done, setDone]   = useState(false)
  const [error, setError] = useState('')

  async function handleSetAdmin() {
    if (!user) { setError('먼저 로그인하세요.'); return }
    try {
      await setDoc(doc(db, 'users', user.uid), {
        uid:       user.uid,
        email:     user.email,
        name:      user.displayName || '',
        role:      'super_admin',
        class:     '',
        updatedAt: serverTimestamp(),
      }, { merge: true })
      setDone(true)
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
        <div className="text-4xl mb-4">🔑</div>
        <h1 className="text-xl font-bold text-gray-800 mb-2">Super Admin 등록</h1>

        {!user ? (
          <p className="text-red-500 text-sm">로그인이 필요합니다.</p>
        ) : done ? (
          <>
            <p className="text-green-600 font-semibold mb-1">✅ 등록 완료!</p>
            <p className="text-gray-500 text-sm mb-4">{user.email}</p>
            <button
              onClick={() => navigate('/')}
              className="bg-blue-600 text-white px-6 py-2 rounded-xl font-semibold hover:bg-blue-700"
            >
              홈으로 (재로그인 필요)
            </button>
          </>
        ) : (
          <>
            <p className="text-gray-500 text-sm mb-1">현재 로그인:</p>
            <p className="font-semibold text-gray-800 mb-4">{user?.email}</p>
            {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
            <button
              onClick={handleSetAdmin}
              className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 active:scale-95 transition-all"
            >
              이 계정을 Super Admin으로 등록
            </button>
          </>
        )}
      </div>
    </div>
  )
}
