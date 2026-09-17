import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from '../../firebase.js'
import { useAuth } from '../../App.jsx'
import {
  listTeacherRequests, listTeachers,
  approveTeacherRequest, rejectTeacherRequest, revokeTeacherRole
} from '../../services/users.js'
import { listPassages, listAssignments } from '../../services/essay.js'
import { listTemplates } from '../../services/reportTemplates.js'

function formatDate(ts) {
  if (!ts?.toDate) return '—'
  return ts.toDate().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
}

/**
 * super_admin 전용 홈. 지문/배정을 직접 만들거나 학생 제출물을 들여다보는 화면이 아니라
 * (그건 이제 teacher 전용 — App.jsx의 RequireTeacherOnly), 교사 계정을 승인·관리하는
 * 화면이다. 각 교사가 만든 지문/배정/양식 개수는 현황 파악용으로 읽기 전용으로만 보여주고,
 * 그 내용 자체를 열어보거나 학생 제출물/리플레이에 접근하는 기능은 의도적으로 두지 않았다
 * (교사의 학급 운영에 super_admin이 개입하지 않는다는 원칙).
 */
export default function SuperAdminHome() {
  const navigate = useNavigate()
  const { user, userInfo } = useAuth()
  const [requests, setRequests] = useState([])
  const [teachers, setTeachers] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyUid, setBusyUid] = useState('')

  function reload() {
    setLoading(true)
    Promise.all([listTeacherRequests(), listTeachers()]).then(async ([r, t]) => {
      setRequests(r)
      const withStats = await Promise.all(t.map(async teacher => {
        const [passages, assignments, templates] = await Promise.all([
          listPassages(teacher.uid),
          listAssignments(teacher.uid),
          listTemplates(teacher.uid)
        ])
        return {
          ...teacher,
          passageCount: passages.length,
          assignmentCount: assignments.length,
          templateCount: templates.length
        }
      }))
      setTeachers(withStats)
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
    if (!window.confirm('이 교사의 권한을 해제할까요? 이미 만든 지문/배정/제출물 데이터는 그대로 남지만, 해제 후에는 그 교사 계정으로 접근할 수 없게 됩니다.')) return
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
      <header className="bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between shadow-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-xs font-bold">🔑</span>
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900">관리자</h1>
            <p className="text-xs text-gray-500">Super Admin · 교사 계정 관리</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600 hidden sm:block">{userInfo?.name || user?.displayName}</span>
          <button
            onClick={async () => { await signOut(auth); navigate('/login') }}
            className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50"
          >
            로그아웃
          </button>
        </div>
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
              <h2 className="text-sm font-bold text-gray-700 mb-3">활성 교사 ({teachers.length})</h2>
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
                        <p className="text-xs text-gray-400 mt-1">
                          지문 {t.passageCount} · 배정 {t.assignmentCount} · 양식 {t.templateCount}
                        </p>
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
