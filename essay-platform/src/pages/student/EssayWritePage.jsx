import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../App.jsx'
import {
  getAssignment, getPassage, getOrCreateSubmission,
  saveSubmissionDraft, submitSubmission, saveSectionsDraft, submitSections
} from '../../services/essay.js'
import { getTemplate } from '../../services/reportTemplates.js'
import { scanText } from '../../utils/aiPatterns.js'
import { htmlToPlainText } from '../../utils/richText.js'
import { useAutosave } from '../../hooks/useAutosave.js'
import { useEssayLogger } from '../../hooks/useEssayLogger.js'
import PassageViewer from './PassageViewer.jsx'
import EssayEditor from '../../components/EssayEditor.jsx'
import StructuredReportEditor from './StructuredReportEditor.jsx'
import SaveStateLabel from '../../components/SaveStateLabel.jsx'

export default function EssayWritePage() {
  const { assignmentId } = useParams()
  const navigate = useNavigate()
  const { user, userInfo } = useAuth()

  const [assignment, setAssignment] = useState(null)
  const [passage, setPassage] = useState(null)
  const [template, setTemplate] = useState(null)
  const [submission, setSubmission] = useState(null)
  const [text, setText] = useState('')
  const [sections, setSections] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const isStructured = assignment?.responseType === 'structured'

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        let a
        try {
          a = await getAssignment(assignmentId)
        } catch (err) {
          throw new Error(`과제 정보 접근 실패: ${err.message || err.code || '권한 또는 네트워크 오류'}`)
        }
        if (!a) {
          if (!cancelled) { setError('존재하지 않는 과제입니다.'); setLoading(false) }
          return
        }

        // 지문은 이제 선택 사항이다 — structured 응답은 지문 없이 배정될 수 있다.
        let p = null
        if (a.passageId) {
          try {
            p = await getPassage(a.passageId)
          } catch (err) {
            throw new Error(`지문 정보 접근 실패: ${err.message || err.code || '권한 또는 네트워크 오류'}`)
          }
          if (!p) throw new Error('연결된 지문을 찾을 수 없습니다. 선생님께 알려주세요.')
        }

        let tpl = null
        if (a.responseType === 'structured') {
          try {
            tpl = await getTemplate(a.templateId)
          } catch (err) {
            throw new Error(`보고서 양식 접근 실패: ${err.message || err.code || '권한 또는 네트워크 오류'}`)
          }
          if (!tpl) throw new Error('연결된 보고서 양식을 찾을 수 없습니다. 선생님께 알려주세요.')
        }

        let sub
        try {
          sub = await getOrCreateSubmission(assignmentId, {
            uid: user.uid,
            name: userInfo?.name || user.displayName || '',
            class: userInfo?.class || ''
          }, a.createdBy, tpl?.sections)
        } catch (err) {
          throw new Error(`내 작성 공간 생성 실패: ${err.message || err.code || '권한 또는 네트워크 오류'}`)
        }
        if (cancelled) return
        setAssignment(a)
        setPassage(p)
        setTemplate(tpl)
        setSubmission(sub)
        setText(sub.text || '')
        setSections(sub.sections || {})
      } catch (err) {
        console.error('과제 로드 실패:', err)
        if (!cancelled) setError(err.message || '과제를 불러오지 못했습니다.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    if (user) load()
    return () => { cancelled = true }
  }, [assignmentId, user, userInfo])

  const locked = submission?.status === 'submitted' || assignment?.status === 'closed'

  const { saveState, trigger, flushNow } = useAutosave(async (value) => {
    if (isStructured) {
      const withAiFlags = Object.fromEntries(
        Object.entries(value).map(([id, ans]) => [id, { ...ans, aiFlags: scanText(htmlToPlainText(ans.text || '')) }])
      )
      await saveSectionsDraft(submission.id, withAiFlags)
    } else {
      const plainText = htmlToPlainText(value)
      const aiFlags = scanText(plainText)
      await saveSubmissionDraft(submission.id, { text: value, charCount: plainText.length, aiFlags })
    }
  }, { delay: 700 })

  const { logInput, logKeydown, logPaste, flushNow: flushLogs } = useEssayLogger(submission?.id)

  function handleTextChange(value) {
    setText(value)
    if (!locked) trigger(value)
  }

  function handleSectionsChange(nextSections) {
    setSections(nextSections)
    if (!locked) trigger(nextSections)
  }

  const requiredMissing = isStructured
    ? (template?.sections || []).filter(s => s.required && !htmlToPlainText(sections[s.id]?.text || '').trim())
    : []
  const canSubmit = isStructured
    ? requiredMissing.length === 0
    : htmlToPlainText(text).trim().length > 0

  async function handleSubmit() {
    if (isStructured && requiredMissing.length > 0) {
      alert(`아직 채우지 않은 필수 항목이 있습니다: ${requiredMissing.map(s => s.heading || s.groupLabel).join(', ')}`)
      return
    }
    if (!window.confirm('제출하시겠어요? 제출 후에는 선생님이 다시 열어주기 전까지 수정할 수 없습니다.')) return
    setSubmitting(true)
    try {
      await flushNow()
      await flushLogs()
      if (isStructured) {
        const withAiFlags = Object.fromEntries(
          Object.entries(sections).map(([id, ans]) => [id, { ...ans, aiFlags: scanText(htmlToPlainText(ans.text || '')) }])
        )
        await submitSections(submission.id, withAiFlags)
      } else {
        const plainText = htmlToPlainText(text)
        const aiFlags = scanText(plainText)
        await submitSubmission(submission.id, { text, charCount: plainText.length, aiFlags })
      }
      setSubmission(s => ({ ...s, status: 'submitted' }))
    } catch (err) {
      console.error('제출 실패:', err)
      alert('제출 중 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <p className="text-gray-500 mb-4">{error}</p>
          <button onClick={() => navigate('/')} className="text-indigo-600 text-sm underline">홈으로</button>
        </div>
      </div>
    )
  }

  const isPastDue = assignment.dueAt?.toDate ? assignment.dueAt.toDate() < new Date() : false
  const wordLimit = assignment.wordLimit || passage?.wordLimitGuide || 800

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shadow-sm sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-base font-bold text-gray-900">{assignment.title || '서술형 수행평가'}</h1>
          <p className="text-xs text-gray-500">
            {userInfo?.name || user?.displayName} {userInfo?.class && `· ${userInfo.class}반`}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {!locked && <SaveStateLabel state={saveState} />}
          {locked && (
            <span className="text-xs bg-green-100 text-green-700 rounded-full px-3 py-1 font-medium">✅ 제출 완료</span>
          )}
        </div>
      </header>

      {/* 안내 배너 */}
      <div className="bg-indigo-50 border-b border-indigo-100 px-4 py-2 text-center">
        <p className="text-xs text-indigo-700">
          본인이 직접 작성해야 하며, 작성 과정이 함께 기록됩니다.{' '}
          {isStructured ? '각 항목의 안내에 따라 빠짐없이 작성해주세요.' : `목표 분량은 ${wordLimit}자 내외입니다.`}
          {isPastDue && !locked && <span className="text-red-600 font-medium"> · 마감일이 지났습니다.</span>}
        </p>
      </div>

      <main className="flex-1 p-4 max-w-6xl mx-auto w-full min-h-0">
        <div className={passage ? 'grid grid-cols-1 lg:grid-cols-2 gap-5 lg:h-[calc(100vh-160px)]' : ''}>
          {/* min-h-0: flex/grid 항목은 기본적으로 내용 높이만큼 늘어나려 해서, 지정한 높이(h-full) 안에서
              PassageViewer 자체의 overflow-y-auto가 실제로 동작하려면 이 min-h-0이 꼭 필요하다. */}
          {passage && (
            <div className="min-h-0 h-[50vh] lg:h-full">
              <PassageViewer passage={passage} />
            </div>
          )}
          {/* overflow-y-auto: 지문이 있는 배정은 왼쪽(지문)과 오른쪽(작성 영역)을 각각 독립적으로
              스크롤시킨다. 오른쪽 칸(질문+입력창+제출 버튼)이 배정된 높이(h-[60vh]/lg:h-full)를
              넘으면 이 칸만 스크롤되고, 왼쪽 지문 칸은 그 위의 min-h-0/h-full로 따로 스크롤된다.
              입력창(EssayEditor)은 autoResize로 내부 스크롤 없이 글자 수만큼 길어지므로, 넘친
              내용을 보려면 이 칸을 스크롤하면 된다 — 제출 버튼도 입력창 바로 아래에 같은 칸
              안에 있어 함께 스크롤된다. */}
          <div className={passage ? 'flex flex-col min-h-0 h-[60vh] lg:h-full overflow-y-auto' : 'flex flex-col'}>
            {passage?.questionPrompt && (
              <div className="flex-shrink-0 rounded-xl bg-indigo-50 border border-indigo-100 p-3 mb-3">
                <p className="text-xs font-bold text-indigo-700 mb-1">📝 논술 문항</p>
                <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{passage.questionPrompt}</p>
              </div>
            )}

            {isStructured ? (
              <StructuredReportEditor
                template={template}
                sections={sections}
                onChange={handleSectionsChange}
                disabled={locked}
                logInput={logInput}
                logKeydown={logKeydown}
                logPaste={logPaste}
              />
            ) : (
              <EssayEditor
                value={text}
                onChange={handleTextChange}
                disabled={locked}
                wordLimitGuide={wordLimit}
                onLogInput={logInput}
                onLogKeydown={logKeydown}
                onLogPaste={logPaste}
              />
            )}

            {/* 제출 버튼은 입력창 바로 아래, 이 칸(작성 영역) 안에 함께 있다 — 입력창이
                autoResize로 길어지면 버튼도 같이 내려가고, 화면을 넘으면 이 칸 자체가
                overflow-y-auto로 스크롤되면서 버튼도 함께 스크롤된다. 왼쪽 지문 칸은
                별도 높이/스크롤을 가진 형제라 이 칸과 독립적으로 스크롤된다. */}
            {!locked && (
              <button
                onClick={handleSubmit}
                disabled={submitting || !canSubmit}
                className="mt-3 flex-shrink-0 w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm disabled:opacity-40 transition-colors active:scale-95"
              >
                {submitting ? '제출 중...' : '제출하기'}
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
