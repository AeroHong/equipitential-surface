import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ThemeProvider } from '@mui/material/styles'
import { useAuth } from '../../../App.jsx'
import {
  getTemplate, createTemplate, updateTemplate, getTemplateKind, TEMPLATE_KIND_QUESTION_SET
} from '../../../services/reportTemplates.js'
import { sanitizePassageHtml, isEmptyHtml } from '../../../utils/sanitizeHtml.js'
import { theme } from '../../../theme.js'
import RichTextEditor from '../../../components/richtext/RichTextEditor.jsx'
import ToastProvider from '../../../components/richtext/ToastProvider.jsx'

function makeSectionId() {
  return `sec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

function emptyQuestion() {
  return { id: makeSectionId(), heading: '', promptHtml: '', required: true, wordLimitGuide: null, maxScore: null }
}

const emptyForm = { title: '', description: '', sections: [emptyQuestion()] }

/**
 * 서술형 문항 세트 편집기. 보고서 양식(TemplateEditor)은 안내 문구가 한 줄짜리 평문이라
 * 그림·수식이 들어가는 문항을 쓰기 어려워서, 문항 본문을 지문과 같은 RichTextEditor(이미지
 * 붙여넣기/끌어다 놓기, 서식)로 쓰게 한 별도 화면이다. 저장 형식은 보고서 양식과 같은
 * reportTemplates 문서(kind: 'question_set')라서 배정·채점·리플레이는 그대로 동작한다.
 */
export default function QuestionSetEditor() {
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
      if (t && t.createdBy !== user.uid) {
        setAccessDenied(true)
        setLoading(false)
        return
      }
      if (t && getTemplateKind(t) !== TEMPLATE_KIND_QUESTION_SET) {
        navigate(`/admin/templates/${templateId}/edit`, { replace: true })
        return
      }
      if (t) {
        setForm({
          ...emptyForm,
          ...t,
          sections: t.sections?.length
            ? t.sections.map(s => ({ ...emptyQuestion(), ...s }))
            : [emptyQuestion()]
        })
      }
      setLoading(false)
    })
  }, [isEdit, templateId, user, navigate])

  function set(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function setQuestion(idx, patch) {
    setForm(prev => ({
      ...prev,
      sections: prev.sections.map((s, i) => i === idx ? { ...s, ...patch } : s)
    }))
  }

  function addQuestion() {
    setForm(prev => ({ ...prev, sections: [...prev.sections, emptyQuestion()] }))
  }

  function removeQuestion(idx) {
    const q = form.sections[idx]
    if (!isEmptyHtml(sanitizePassageHtml(q.promptHtml || '')) && !window.confirm(`문항 ${idx + 1}을 삭제할까요?`)) return
    setForm(prev => ({ ...prev, sections: prev.sections.filter((_, i) => i !== idx) }))
  }

  function moveQuestion(idx, dir) {
    setForm(prev => {
      const next = [...prev.sections]
      const target = idx + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return { ...prev, sections: next }
    })
  }

  async function handleSave() {
    if (!form.title.trim()) { alert('문항 세트 제목을 입력해주세요.'); return }
    const sections = form.sections
      .map(s => ({ ...s, promptHtml: sanitizePassageHtml(s.promptHtml || '') }))
      .filter(s => !isEmptyHtml(s.promptHtml) || s.heading.trim())
      .map((s, i) => ({
        id: s.id,
        // 학생 화면의 진행 칩, 리플레이, 채점 패널이 전부 heading을 문항 이름으로 쓰므로
        // 비워두면 번호로 채운다.
        groupLabel: '',
        heading: s.heading.trim() || `문항 ${i + 1}`,
        guidance: '',
        promptHtml: isEmptyHtml(s.promptHtml) ? '' : s.promptHtml,
        required: !!s.required,
        wordLimitGuide: s.wordLimitGuide ? Number(s.wordLimitGuide) : null,
        maxScore: s.maxScore ? Number(s.maxScore) : null
      }))
    if (sections.length === 0) { alert('문항을 하나 이상 입력해주세요.'); return }

    setSaving(true)
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description,
        sections,
        kind: TEMPLATE_KIND_QUESTION_SET
      }
      if (isEdit) {
        await updateTemplate(templateId, payload)
      } else {
        await createTemplate(payload)
      }
      navigate('/admin/question-sets')
    } catch (err) {
      console.error('문항 세트 저장 실패:', err)
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
          <p className="text-gray-500 mb-4">다른 교사가 만든 문항 세트라 수정할 수 없습니다.</p>
          <button onClick={() => navigate('/admin/question-sets')} className="text-indigo-600 text-sm underline">돌아가기</button>
        </div>
      </div>
    )
  }

  const inputClass = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300'
  const labelClass = 'block text-xs font-bold text-gray-600 mb-1.5'
  const totalMaxScore = form.sections.reduce((sum, s) => sum + (Number(s.maxScore) || 0), 0)

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shadow-sm sticky top-0 z-10">
        <button onClick={() => navigate('/admin/question-sets')} className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-base font-bold text-gray-900">{isEdit ? '문항 세트 수정' : '새 문항 세트 만들기'}</h1>
        {totalMaxScore > 0 && <span className="ml-auto text-xs text-gray-500">총 배점 {totalMaxScore}점</span>}
      </header>

      <main className="flex-1 p-5 max-w-4xl mx-auto w-full space-y-6">
        <div>
          <label className={labelClass}>문항 세트 제목</label>
          <input className={inputClass} value={form.title} onChange={e => set('title', e.target.value)} placeholder="예: 2학기 물리학Ⅱ 서술형 평가" />
        </div>

        <div>
          <label className={labelClass}>공통 안내 (선택, 학생 화면 상단에 표시)</label>
          <textarea className={`${inputClass} resize-none`} rows={2} value={form.description} onChange={e => set('description', e.target.value)} placeholder="예: 풀이 과정을 반드시 쓰시오. 단위를 빠뜨리면 감점됩니다." />
        </div>

        <ThemeProvider theme={theme}>
          <ToastProvider>
            <div className="space-y-4">
              {form.sections.map((q, idx) => (
                <div key={q.id} className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-bold text-indigo-700 flex-shrink-0">문항 {idx + 1}</span>
                    <input
                      className={`${inputClass} flex-1`}
                      value={q.heading}
                      onChange={e => setQuestion(idx, { heading: e.target.value })}
                      placeholder={`문항 이름 (선택, 비우면 "문항 ${idx + 1}")`}
                    />
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => moveQuestion(idx, -1)} disabled={idx === 0} title="위로" className="text-gray-300 hover:text-indigo-600 disabled:opacity-30 disabled:hover:text-gray-300 px-1.5">▲</button>
                      <button onClick={() => moveQuestion(idx, 1)} disabled={idx === form.sections.length - 1} title="아래로" className="text-gray-300 hover:text-indigo-600 disabled:opacity-30 disabled:hover:text-gray-300 px-1.5">▼</button>
                      <button onClick={() => removeQuestion(idx)} title="삭제" className="text-gray-300 hover:text-red-500 px-1.5">✕</button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-400 mb-1">문항 내용 — 글을 쓰고, 그림은 붙여넣거나(Ctrl+V) 끌어다 놓으면 됩니다. '/'를 치면 서식 메뉴가 뜹니다.</label>
                    <RichTextEditor
                      value={q.promptHtml}
                      onChange={html => setQuestion(idx, { promptHtml: html })}
                      placeholder="문항을 입력하세요."
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-1.5 text-xs text-gray-600">
                      <input type="checkbox" checked={q.required} onChange={e => setQuestion(idx, { required: e.target.checked })} />
                      필수 응답
                    </label>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-400">배점</span>
                      <input
                        type="number"
                        className={`${inputClass} w-20`}
                        value={q.maxScore ?? ''}
                        onChange={e => setQuestion(idx, { maxScore: e.target.value })}
                        placeholder="예: 10"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-400">분량 가이드(자, 선택)</span>
                      <input
                        type="number"
                        className={`${inputClass} w-24`}
                        value={q.wordLimitGuide ?? ''}
                        onChange={e => setQuestion(idx, { wordLimitGuide: e.target.value })}
                        placeholder="예: 200"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ToastProvider>
        </ThemeProvider>
        <button onClick={addQuestion} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">+ 문항 추가</button>

        <div className="flex gap-2 pt-2">
          <button onClick={() => navigate('/admin/question-sets')} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50">
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
