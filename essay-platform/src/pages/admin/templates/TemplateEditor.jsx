import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../../App.jsx'
import { getTemplate, createTemplate, updateTemplate } from '../../../services/reportTemplates.js'

function makeSectionId() {
  return `sec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

function emptySection() {
  return { id: makeSectionId(), groupLabel: '', heading: '', guidance: '', required: true, wordLimitGuide: null }
}

const emptyForm = { title: '', description: '', sections: [emptySection()] }

export default function TemplateEditor() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { templateId } = useParams()
  const isEdit = Boolean(templateId)
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [accessDenied, setAccessDenied] = useState(false)

  useEffect(() => {
    if (!isEdit) return
    getTemplate(templateId).then(t => {
      // 본인이 만든 양식만 수정할 수 있다 — 저장 자체는 firestore.rules가 막지만, 편집
      // 가능한 것처럼 보이다 저장에서만 실패하면 혼란스럽다.
      if (t && t.createdBy !== user.uid) {
        setAccessDenied(true)
        setLoading(false)
        return
      }
      if (t) setForm({ ...emptyForm, ...t, sections: t.sections?.length ? t.sections : [emptySection()] })
      setLoading(false)
    })
  }, [isEdit, templateId, user])

  function set(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function setSection(idx, patch) {
    setForm(prev => ({
      ...prev,
      sections: prev.sections.map((s, i) => i === idx ? { ...s, ...patch } : s)
    }))
  }

  function addSection() {
    setForm(prev => ({ ...prev, sections: [...prev.sections, emptySection()] }))
  }

  function removeSection(idx) {
    setForm(prev => ({ ...prev, sections: prev.sections.filter((_, i) => i !== idx) }))
  }

  function moveSection(idx, dir) {
    setForm(prev => {
      const next = [...prev.sections]
      const target = idx + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return { ...prev, sections: next }
    })
  }

  async function handleSave() {
    if (!form.title.trim()) { alert('양식 제목을 입력해주세요.'); return }
    const sections = form.sections
      .filter(s => s.heading.trim() || s.groupLabel.trim())
      .map(s => ({
        id: s.id,
        groupLabel: s.groupLabel.trim(),
        heading: s.heading.trim(),
        guidance: s.guidance.trim(),
        required: !!s.required,
        wordLimitGuide: s.wordLimitGuide ? Number(s.wordLimitGuide) : null
      }))
    if (sections.length === 0) { alert('섹션을 하나 이상 입력해주세요.'); return }

    setSaving(true)
    try {
      const payload = { title: form.title.trim(), description: form.description, sections }
      if (isEdit) {
        await updateTemplate(templateId, payload)
      } else {
        await createTemplate(payload)
      }
      navigate('/admin/templates')
    } catch (err) {
      console.error('양식 저장 실패:', err)
      alert('저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (accessDenied) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 px-4">
        <div className="text-center">
          <p className="text-gray-500 mb-4">다른 교사가 만든 양식이라 수정할 수 없습니다.</p>
          <button onClick={() => navigate('/admin/templates')} className="text-indigo-600 text-sm underline">돌아가기</button>
        </div>
      </div>
    )
  }

  const inputClass = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300'
  const labelClass = 'block text-xs font-bold text-gray-600 mb-1.5'

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shadow-sm sticky top-0 z-10">
        <button onClick={() => navigate('/admin/templates')} className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-base font-bold text-gray-900">{isEdit ? '양식 수정' : '새 양식 만들기'}</h1>
      </header>

      <main className="flex-1 p-5 max-w-3xl mx-auto w-full space-y-6">
        <div>
          <label className={labelClass}>양식 제목</label>
          <input className={inputClass} value={form.title} onChange={e => set('title', e.target.value)} placeholder="예: 수학 주제형 탐구 보고서" />
        </div>

        <div>
          <label className={labelClass}>양식 설명 (선택, 학생 화면 상단에 표시)</label>
          <textarea className={`${inputClass} resize-none`} rows={2} value={form.description} onChange={e => set('description', e.target.value)} placeholder="이 보고서 양식에 대한 간단한 안내" />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className={labelClass}>섹션 (학생이 채울 항목들, 순서대로 표시됩니다)</label>
          </div>
          <div className="space-y-3">
            {form.sections.map((s, idx) => (
              <div key={s.id} className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-400">섹션 {idx + 1}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => moveSection(idx, -1)} disabled={idx === 0} className="text-gray-300 hover:text-indigo-600 disabled:opacity-30 disabled:hover:text-gray-300 px-1.5">▲</button>
                    <button onClick={() => moveSection(idx, 1)} disabled={idx === form.sections.length - 1} className="text-gray-300 hover:text-indigo-600 disabled:opacity-30 disabled:hover:text-gray-300 px-1.5">▼</button>
                    <button onClick={() => removeSection(idx)} className="text-gray-300 hover:text-red-500 px-1.5">✕</button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">그룹 라벨 (선택, 예: "Ⅰ. 탐구 주제" — 연속되면 화면에서 묶여 보입니다)</label>
                    <input className={inputClass} value={s.groupLabel} onChange={e => setSection(idx, { groupLabel: e.target.value })} placeholder="Ⅰ. 탐구 주제" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">소제목 (이 섹션 자체가 입력란이면 비워도 됩니다)</label>
                    <input className={inputClass} value={s.heading} onChange={e => setSection(idx, { heading: e.target.value })} placeholder="탐구 제목" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">안내 문구 (학생에게 보여줄 설명)</label>
                  <textarea className={`${inputClass} resize-none`} rows={2} value={s.guidance} onChange={e => setSection(idx, { guidance: e.target.value })} placeholder="예: 내가 탐구하고 싶은 주제를 한 문장으로 표현한다." />
                </div>

                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 text-xs text-gray-600">
                    <input type="checkbox" checked={s.required} onChange={e => setSection(idx, { required: e.target.checked })} />
                    필수 항목
                  </label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-400">분량 가이드(자, 선택)</span>
                    <input
                      type="number"
                      className={`${inputClass} w-24`}
                      value={s.wordLimitGuide ?? ''}
                      onChange={e => setSection(idx, { wordLimitGuide: e.target.value })}
                      placeholder="예: 200"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button onClick={addSection} className="mt-3 text-xs text-indigo-600 hover:text-indigo-800 font-medium">+ 섹션 추가</button>
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={() => navigate('/admin/templates')} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50">
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:opacity-40 transition-colors"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </main>
    </div>
  )
}
