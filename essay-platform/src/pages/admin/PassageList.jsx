import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listPassages, updatePassage } from '../../services/essay.js'

export default function PassageList() {
  const navigate = useNavigate()
  const [passages, setPassages] = useState([])
  const [loading, setLoading] = useState(true)

  function reload() {
    setLoading(true)
    listPassages().then(data => { setPassages(data); setLoading(false) })
  }

  useEffect(() => { reload() }, [])

  async function toggleActive(p) {
    await updatePassage(p.id, { active: !p.active })
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
        <h1 className="text-base font-bold text-gray-900">지문 관리</h1>
        <button
          onClick={() => navigate('/admin/passages/new')}
          className="ml-auto text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl px-4 py-2 transition-colors active:scale-95"
        >
          + 새 지문
        </button>
      </header>

      <main className="flex-1 p-5 max-w-4xl mx-auto w-full">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : passages.length === 0 ? (
          <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-gray-200">
            등록된 지문이 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {passages.map(p => (
              <div key={p.id} className={`bg-white rounded-2xl border p-4 flex items-center gap-4 ${p.active ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-800 text-sm truncate">{p.title || '(제목 없음)'}</p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{p.bodyText?.slice(0, 80)}</p>
                </div>
                <button
                  onClick={() => toggleActive(p)}
                  className={`text-xs rounded-full px-2.5 py-1 border font-medium flex-shrink-0 ${
                    p.active ? 'bg-green-100 text-green-700 border-green-200' : 'bg-gray-100 text-gray-400 border-gray-200'
                  }`}
                >
                  {p.active ? '활성' : '보관'}
                </button>
                <button
                  onClick={() => navigate(`/admin/passages/${p.id}/edit`)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-50 font-medium transition-colors flex-shrink-0"
                >
                  수정
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
