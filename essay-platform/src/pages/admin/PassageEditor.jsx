import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ThemeProvider } from '@mui/material/styles'
import TextField from '@mui/material/TextField'
import { getPassage, createPassage, updatePassage } from '../../services/essay.js'
import { importPassageDocx } from '../../services/docxImport.js'
import { sanitizePassageHtml, htmlToText, isEmptyHtml } from '../../utils/sanitizeHtml.js'
import { theme } from '../../theme.js'
import { toYoutubeEmbedUrl } from '../../utils/youtube.js'
import RichTextEditor from '../../components/richtext/RichTextEditor.jsx'
import ToastProvider from '../../components/richtext/ToastProvider.jsx'

const emptyForm = { title: '', bodyHtml: '', videoUrl: '', questionPrompt: '', wordLimitGuide: 800 }

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * 서식 도입 전(구형) 지문은 bodyHtml 없이 bodyText+imageUrls만 있다. 그대로 에디터를 열면
 * 빈 문서로 보여 실수로 지워버릴 위험이 있으므로, 열 때 문단/이미지를 HTML로 변환해 채운다.
 * 그대로 저장하면 자연스럽게 새 형식(bodyHtml)으로 넘어간다.
 */
function legacyToHtml(passage) {
  const paragraphs = (passage.bodyText || '')
    .split(/\n{2,}/)
    .filter(Boolean)
    .map(block => `<p>${escapeHtml(block).replace(/\n/g, '<br/>')}</p>`)
    .join('')
  const images = (passage.imageUrls || [])
    .filter(Boolean)
    .map(url => `<img src="${url}" alt="" />`)
    .join('')
  return paragraphs + images
}

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
      if (p) {
        setForm({ ...emptyForm, ...p, bodyHtml: p.bodyHtml || legacyToHtml(p) })
      }
      setLoading(false)
    })
  }, [isEdit, passageId])

  function set(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
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
        bodyHtml: imported.bodyHtml || prev.bodyHtml
      }))
      setImportNotice('문서의 문단·서식·이미지를 불러왔습니다. 에디터에서 내용을 검토한 뒤 저장하세요.')
    } catch (err) {
      console.error('DOCX 불러오기 실패:', err)
      setImportError(err.message || 'DOCX를 불러오지 못했습니다.')
    } finally {
      setImporting(false)
    }
  }

  async function handleSave() {
    const safeHtml = sanitizePassageHtml(form.bodyHtml)
    if (!form.title.trim() || isEmptyHtml(safeHtml)) {
      alert('제목과 본문은 필수입니다.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        title: form.title.trim(),
        bodyHtml: safeHtml,
        bodyText: htmlToText(safeHtml),
        imageUrls: [],
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
  const embedUrl = toYoutubeEmbedUrl(form.videoUrl)

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

      <main className="flex-1 p-5 w-full">
        <div className="max-w-6xl mx-auto space-y-5">
          <section className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
            <p className="text-sm font-bold text-indigo-950">DOCX 읽기자료 불러오기</p>
            <p className="mt-1 text-xs leading-relaxed text-indigo-700">문서의 제목·본문 서식·이미지를 그대로 불러와 아래 에디터에 채웁니다. 불러온 뒤에도 에디터에서 계속 다듬을 수 있어요.</p>
            <label className="mt-3 inline-flex cursor-pointer items-center rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
              <input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" onChange={handleDocxImport} disabled={importing} />
              {importing ? 'DOCX 및 이미지 불러오는 중...' : 'DOCX 불러오기'}
            </label>
            {importNotice && <p className="mt-2 text-xs text-emerald-700">{importNotice}</p>}
            {importError && <p className="mt-2 text-xs text-red-600">{importError}</p>}
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 items-start">
            {/* 좌측: 제목 + 본문 — ThemeProvider/ToastProvider는 DOM 요소를 만들지 않으므로
                그 안의 두 div가 그리드에 따로따로 배치되지 않도록 실제 <div>로 한 번 더 감싼다. */}
            <div>
              <ThemeProvider theme={theme}>
                <ToastProvider>
                  <div>
                    <label className={labelClass}>제목</label>
                    <TextField
                      fullWidth
                      value={form.title}
                      onChange={e => set('title', e.target.value)}
                      placeholder="예: 밀리컨의 기름방울 실험"
                    />
                  </div>

                  <div className="mt-5">
                    <label className={labelClass}>본문</label>
                    <RichTextEditor
                      value={form.bodyHtml}
                      onChange={html => set('bodyHtml', html)}
                      placeholder="학생에게 보여줄 읽기자료 본문을 작성하세요. 이미지는 붙여넣거나 끌어다 놓으면 됩니다. '/'를 치면 서식 메뉴가 뜹니다."
                    />
                  </div>
                </ToastProvider>
              </ThemeProvider>
            </div>

            {/* 우측: 영상, 논술 문항, 분량 가이드 */}
            <div className="space-y-5">
              <div>
                <label className={labelClass}>영상 URL (선택, 유튜브 링크 권장)</label>
                <input className={inputClass} value={form.videoUrl} onChange={e => set('videoUrl', e.target.value)} placeholder="https://youtube.com/watch?v=..." />
                {form.videoUrl && (
                  embedUrl ? (
                    <div className="aspect-video rounded-xl overflow-hidden border border-gray-200 mt-2">
                      <iframe
                        src={embedUrl}
                        className="w-full h-full"
                        title="영상 미리보기"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                  ) : (
                    <a
                      href={form.videoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block text-xs text-indigo-600 hover:text-indigo-800 underline underline-offset-2"
                    >
                      🎬 링크 열어서 확인 →
                    </a>
                  )
                )}
              </div>

              <div>
                <label className={labelClass}>논술 문항</label>
                <textarea className={`${inputClass} resize-none`} rows={5} value={form.questionPrompt} onChange={e => set('questionPrompt', e.target.value)} placeholder="학생에게 제시할 논술 문항을 입력하세요." />
              </div>

              <div>
                <label className={labelClass}>목표 분량 가이드 (자)</label>
                <input type="number" className={`${inputClass} max-w-[140px]`} value={form.wordLimitGuide} onChange={e => set('wordLimitGuide', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-2 max-w-sm">
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
        </div>
      </main>
    </div>
  )
}
