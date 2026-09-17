import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../App.jsx'
import { listTemplates, updateTemplate, deleteTemplate, listAssignmentsUsingTemplate } from '../../../services/reportTemplates.js'

export default function TemplateList() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)

  // 이 화면은 teacher 전용이다(super_admin은 양식을 직접 만들지 않는다) — 본인이 만든
  // 템플릿만 firestore.rules와 짝을 이뤄 필터링한다.
  function reload() {
    setLoading(true)
    listTemplates(user.uid).then(data => { setTemplates(data); setLoading(false) })
  }

  useEffect(() => { reload() }, [])

  async function toggleActive(t) {
    await updateTemplate(t.id, { active: !t.active })
    reload()
  }

  async function handleDelete(t) {
    const using = await listAssignmentsUsingTemplate(t.id)
    if (using.length > 0) {
      alert(`이 양식을 사용 중인 배정이 ${using.length}개 있어 삭제할 수 없습니다: ${using.map(a => a.title).join(', ')}\n먼저 그 배정을 삭제해주세요.`)
      return
    }
    if (!window.confirm(`"${t.title || '(제목 없음)'}" 양식을 삭제하시겠습니까? 되돌릴 수 없습니다.`)) return
    await deleteTemplate(t.id)
    reload()
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shadow-sm sticky top-0 z-10">
        <button onClick={() => navigate('/admin')} className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-base font-bold text-gray-900">보고서 양식 관리</h1>
        <button
          onClick={() => navigate('/admin/templates/new')}
          className="ml-auto text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl px-4 py-2 transition-colors active:scale-95"
        >
          + 새 양식
        </button>
      </header>

      <main className="flex-1 p-5 max-w-4xl mx-auto w-full">
        <p className="text-xs text-gray-400 mb-4">지문+자유서술이 아니라, 제목별로 나뉜 항목을 학생이 하나씩 채우는 구조화된 응답 양식입니다. 배정을 만들 때 응답 유형을 "구조화된 보고서"로 고르면 여기서 만든 양식을 지정할 수 있어요.</p>
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-gray-200">
            등록된 양식이 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {templates.map(t => (
              <div key={t.id} className={`bg-white rounded-2xl border p-4 flex items-center gap-4 ${t.active ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-800 text-sm truncate">{t.title || '(제목 없음)'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">섹션 {t.sections?.length || 0}개</p>
                </div>
                <button
                  onClick={() => toggleActive(t)}
                  className={`text-xs rounded-full px-2.5 py-1 border font-medium flex-shrink-0 ${
                    t.active ? 'bg-green-100 text-green-700 border-green-200' : 'bg-gray-100 text-gray-400 border-gray-200'
                  }`}
                >
                  {t.active ? '활성' : '보관'}
                </button>
                <button
                  onClick={() => navigate(`/admin/templates/${t.id}/edit`)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-50 font-medium transition-colors flex-shrink-0"
                >
                  수정
                </button>
                <button
                  onClick={() => handleDelete(t)}
                  className="text-xs text-red-500 hover:text-red-700 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 font-medium transition-colors flex-shrink-0"
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
