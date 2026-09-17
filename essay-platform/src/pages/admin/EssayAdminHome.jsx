import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from '../../firebase.js'
import { useAuth } from '../../App.jsx'
import { listAssignments, deleteAssignment, countSubmissionsForAssignment } from '../../services/essay.js'

const STATUS_LABEL = { open: '진행 중', closed: '마감' }

function formatDate(ts) {
  if (!ts?.toDate) return '마감일 없음'
  return ts.toDate().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
}

export default function EssayAdminHome() {
  const navigate = useNavigate()
  const { user, userInfo } = useAuth()
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)

  // 이 화면은 이제 teacher 전용이다(super_admin은 SuperAdminHome을 본다) — 본인이 만든
  // 배정만 firestore.rules와 짝을 이뤄 필터링한다.
  function reload() {
    setLoading(true)
    listAssignments(user.uid).then(data => { setAssignments(data); setLoading(false) })
  }

  useEffect(() => { reload() }, [user])

  async function handleDelete(a) {
    const count = await countSubmissionsForAssignment(a.id, user.uid)
    const warn = count > 0
      ? `\n\n주의: 이미 작성/제출된 학생 응답이 ${count}건 있습니다. 배정을 삭제해도 학생 응답 데이터 자체는 남지만, 이 목록과 대시보드에서는 더 이상 접근할 수 없게 됩니다.`
      : ''
    if (!window.confirm(`"${a.title || '(제목 없음)'}" 배정을 삭제하시겠습니까? 되돌릴 수 없습니다.${warn}`)) return
    await deleteAssignment(a.id)
    reload()
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between shadow-sm sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-xs font-bold">✍️</span>
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900">서술형 수행평가 관리</h1>
            <p className="text-xs text-gray-500">교사</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin/templates')}
            className="text-xs text-emerald-600 hover:text-emerald-800 border border-emerald-200 rounded-lg px-3 py-1.5 hover:bg-emerald-50 font-medium transition-colors"
          >
            📋 보고서 양식 관리
          </button>
          <button
            onClick={() => navigate('/admin/passages')}
            className="text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-50 font-medium transition-colors"
          >
            📄 지문 관리
          </button>
          <span className="text-sm text-gray-600 hidden sm:block">{userInfo?.name || user?.displayName}</span>
          <button
            onClick={async () => { await signOut(auth); navigate('/login') }}
            className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50"
          >
            로그아웃
          </button>
        </div>
      </header>

      <main className="flex-1 p-5 max-w-5xl mx-auto w-full">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-gray-700">배정 목록 ({assignments.length})</h2>
          <button
            onClick={() => navigate('/admin/assignments/new')}
            className="text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl px-4 py-2 transition-colors active:scale-95"
          >
            + 새 배정 만들기
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : assignments.length === 0 ? (
          <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-gray-200">
            아직 만든 배정이 없습니다. 먼저 지문을 등록한 뒤 배정을 만들어보세요.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {assignments.map(a => (
              <div
                key={a.id}
                onClick={() => navigate(`/admin/assignments/${a.id}`)}
                className="text-left bg-white rounded-2xl border-2 border-gray-200 hover:border-indigo-300 hover:shadow-md p-4 transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between mb-2 gap-2">
                  <h3 className="font-bold text-gray-800 text-sm flex-1 min-w-0 truncate">{a.title || '(제목 없음)'}</h3>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className={`text-xs rounded-full px-2 py-0.5 border font-medium ${
                      a.status === 'closed' ? 'bg-gray-100 text-gray-500 border-gray-200' : 'bg-blue-100 text-blue-700 border-blue-200'
                    }`}>
                      {STATUS_LABEL[a.status] || a.status}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(a) }}
                      title="배정 삭제"
                      className="w-5 h-5 flex items-center justify-center rounded-full text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors text-sm leading-none"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-400">마감: {formatDate(a.dueAt)}</p>
                {a.classroom?.courseName && (
                  <p className="text-xs text-emerald-600 mt-1.5">🎓 Classroom 게시됨 — {a.classroom.courseName}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
