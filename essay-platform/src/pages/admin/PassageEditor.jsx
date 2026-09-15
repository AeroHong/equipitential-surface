import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getPassage, createPassage, updatePassage } from '../../services/essay.js'
import { importPassageDocx } from '../../services/docxImport.js'

const emptyForm = { title: '', bodyText: '', bodyHtml: '', imageUrls: [''], videoUrl: '', questionPrompt: '', wordLimitGuide: 800 }

export default function PassageEditor() {
  const navigate = useNavigate()
  const { passageId } = useParams()
  const isEdit = Boolean(passageId)
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [importNotice, setImportNotice] = useState('')

  useEffect(() => {
    if (!isEdit) return
    getPassage(passageId).then(p => {
      if (p) setForm({ ...emptyForm, ...p, imageUrls: p.imageUrls?.length ? p.imageUrls : [''] })
      setLoading(false)
    })
  }, [isEdit, passageId])

  function set(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function setImageUrl(idx, value) {
    setForm(prev => {
      const next = [...prev.imageUrls]
      next[idx] = value
      return { ...prev, imageUrls: next }
    })
  }

  function addImageUrl() {
    setForm(prev => ({ ...prev, imageUrls: [...prev.imageUrls, ''] }))
  }

  function removeImageUrl(idx) {
    setForm(prev => ({ ...prev, imageUrls: prev.imageUrls.filter((_, i) => i !== idx) }))
  }

  async function handleDocxImport(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setImporting(true)
    setImportError('')
    setImportNotice('')
    try {
      const imported = await importPassageDocx(file)
      setForm(prev => ({
        ...prev,
        title: imported.title || prev.title,
        bodyText: imported.bodyText || prev.bodyText,
        bodyHtml: imported.bodyHtml || ''
      }))
      setImportNotice('문서의 문단·서식·이미지를 불러왔습니다. 아래 미리보기에서 내용을 검토한 뒤 저장하세요.')
    } catch (err) {
      console.error('DOCX 불러오기 실패:', err)
      setImportError(err.message || 'DOCX를 불러오지 못했습니다.')
    } finally {
      setImporting(false)
    }
  }

  async function handleSave() {
    if (!form.title.trim() || !form.bodyText.trim()) {
      alert('제목과 본문은 필수입니다.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        title: form.title.trim(),
        bodyText: form.bodyText,
        bodyHtml: form.bodyHtml || '',
        imageUrls: form.imageUrls.map(u => u.trim()).filter(Boolean),
        videoUrl: form.videoUrl.trim(),
        questionPrompt: form.questionPrompt,
        wordLimitGuide: Number(form.wordLimitGuide) || 800
      }
      if (isEdit) {
        await updatePassage(passageId, payload)
      } else {
        await createPassage(payload)
      }
      navigate('/admin/passages')
    } catch (err) {
      console.error('지문 저장 실패:', err)
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

  const inputClass = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300'
  const labelClass = 'block text-xs font-bold text-gray-600 mb-1.5'

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shadow-sm sticky top-0 z-10">
        <button onClick={() => navigate('/admin/passages')} className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-base font-bold text-gray-900">{isEdit ? '지문 수정' : '새 지문 만들기'}</h1>
      </header>

      <main className="flex-1 p-5 max-w-2xl mx-auto w-full space-y-5">
        <section className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
          <p className="text-sm font-bold text-indigo-950">DOCX 읽기자료 불러오기</p>
          <p className="mt-1 text-xs leading-relaxed text-indigo-700">본문과 문서 안의 이미지를 가져옵니다. 이미지는 Firebase Storage에 저장되며, 영상은 아래 URL 입력란을 사용하세요.</p>
          <label className="mt-3 inline-flex cursor-pointer items-center rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
            <input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" onChange={handleDocxImport} disabled={importing} />
            {importing ? 'DOCX 및 이미지 불러오는 중...' : 'DOCX 불러오기'}
          </label>
          {importNotice && <p className="mt-2 text-xs text-emerald-700">{importNotice}</p>}
          {importError && <p className="mt-2 text-xs text-red-600">{importError}</p>}
        </section>

        <div>
          <label className={labelClass}>제목</label>
          <input className={inputClass} value={form.title} onChange={e => set('title', e.target.value)} placeholder="예: 밀리컨의 기름방울 실험" />
        </div>

        {form.bodyHtml ? (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className={labelClass}>본문 미리보기 (DOCX 서식 적용됨)</label>
              <button
                onClick={() => set('bodyHtml', '')}
                className="text-xs text-gray-400 hover:text-red-500"
              >
                서식 제거하고 일반 텍스트로 전환
              </button>
            </div>
            <div
              className="passage-rich max-h-80 overflow-y-auto rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm"
              dangerouslySetInnerHTML={{ __html: form.bodyHtml }}
            />
          </div>
        ) : (
          <div>
            <label className={labelClass}>본문 (지문 텍스트)</label>
            <textarea className={`${inputClass} resize-none`} rows={10} value={form.bodyText} onChange={e => set('bodyText', e.target.value)} placeholder="학생에게 보여줄 읽기자료 본문을 입력하세요." />
          </div>
        )}

        <div>
          <label className={labelClass}>이미지 URL (선택)</label>
          <div className="space-y-2">
            {form.imageUrls.map((url, idx) => (
              <div key={idx} className="flex gap-2">
                <input className={inputClass} value={url} onChange={e => setImageUrl(idx, e.target.value)} placeholder="https://..." />
                {form.imageUrls.length > 1 && (
                  <button onClick={() => removeImageUrl(idx)} className="text-gray-300 hover:text-red-500 px-2">✕</button>
                )}
              </div>
            ))}
          </div>
          <button onClick={addImageUrl} className="text-xs text-indigo-600 hover:text-indigo-800 mt-2">+ 이미지 URL 추가</button>
        </div>

        <div>
          <label className={labelClass}>영상 URL (선택, 유튜브 링크 권장)</label>
          <input className={inputClass} value={form.videoUrl} onChange={e => set('videoUrl', e.target.value)} placeholder="https://youtube.com/watch?v=..." />
        </div>

        <div>
          <label className={labelClass}>논술 문항</label>
          <textarea className={`${inputClass} resize-none`} rows={3} value={form.questionPrompt} onChange={e => set('questionPrompt', e.target.value)} placeholder="학생에게 제시할 논술 문항을 입력하세요." />
        </div>

        <div>
          <label className={labelClass}>목표 분량 가이드 (자)</label>
          <input type="number" className={`${inputClass} max-w-[140px]`} value={form.wordLimitGuide} onChange={e => set('wordLimitGuide', e.target.value)} />
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={() => navigate('/admin/passages')} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50">
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
