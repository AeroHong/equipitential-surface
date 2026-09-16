import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  listTeacherRequests, listTeachers,
  approveTeacherRequest, rejectTeacherRequest, revokeTeacherRole
} from '../../services/users.js'

function formatDate(ts) {
  if (!ts?.toDate) return '—'
  return ts.toDate().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
}

export default function TeacherRequests() {
  const navigate = useNavigate()
  const [requests, setRequests] = useState([])
  const [teachers, setTeachers] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyUid, setBusyUid] = useState('')

  function reload() {
    setLoading(true)
    Promise.all([listTeacherRequests(), listTeachers()]).then(([r, t]) => {
      setRequests(r)
      setTeachers(t)
      setLoading(false)
    })
  }

  useEffect(() => { reload() }, [])

  async function handleApprove(uid) {
    setBusyUid(uid)
    try {
      await approveTeacherRequest(uid)
      reload()
    } finally {
      setBusyUid('')
    }
  }

  async function handleReject(uid) {
    if (!window.confirm('이 요청을 거절할까요? 다시 학생 권한으로 돌아갑니다.')) return
    setBusyUid(uid)
    try {
      await rejectTeacherRequest(uid)
      reload()
    } finally {
      setBusyUid('')
    }
  }

  async function handleRevoke(uid) {
    if (!window.confirm('이 교사의 권한을 해제할까요?')) return
    setBusyUid(uid)
    try {
      await revokeTeacherRole(uid)
      reload()
    } finally {
      setBusyUid('')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shadow-sm sticky top-0 z-10">
        <button onClick={() => navigate('/admin')} className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-base font-bold text-gray-900">교사 권한 관리</h1>
      </header>

      <main className="flex-1 p-5 max-w-3xl mx-auto w-full space-y-8">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <section>
              <h2 className="text-sm font-bold text-gray-700 mb-3">대기 중인 요청 ({requests.length})</h2>
              {requests.length === 0 ? (
                <div className="text-center py-10 text-gray-400 bg-white rounded-2xl border border-gray-200 text-sm">
                  대기 중인 요청이 없습니다.
                </div>
              ) : (
                <div className="space-y-2">
                  {requests.map(r => (
                    <div key={r.uid} className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800 text-sm truncate">{r.name || '(이름 없음)'}</p>
                        <p className="text-xs text-gray-400 truncate">{r.email} · {formatDate(r.roleRequestedAt)} 요청</p>
                      </div>
                      <button
                        onClick={() => handleApprove(r.uid)}
                        disabled={busyUid === r.uid}
                        className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40"
                      >
                        승인
                      </button>
                      <button
                        onClick={() => handleReject(r.uid)}
                        disabled={busyUid === r.uid}
                        className="text-xs text-gray-400 hover:text-red-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors disabled:opacity-40"
                      >
                        거절
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="text-sm font-bold text-gray-700 mb-3">승인된 교사 ({teachers.length})</h2>
              {teachers.length === 0 ? (
                <div className="text-center py-10 text-gray-400 bg-white rounded-2xl border border-gray-200 text-sm">
                  아직 승인된 교사가 없습니다.
                </div>
              ) : (
                <div className="space-y-2">
                  {teachers.map(t => (
                    <div key={t.uid} className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800 text-sm truncate">{t.name || '(이름 없음)'}</p>
                        <p className="text-xs text-gray-400 truncate">{t.email}</p>
                      </div>
                      <button
                        onClick={() => handleRevoke(t.uid)}
                        disabled={busyUid === t.uid}
                        className="text-xs text-gray-400 hover:text-red-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors disabled:opacity-40"
                      >
                        권한 해제
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  )
}
