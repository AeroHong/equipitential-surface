import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../App.jsx'
import { getAssignment, getPassage, getOrCreateSubmission, saveSubmissionDraft, submitSubmission } from '../../services/essay.js'
import { scanText } from '../../utils/aiPatterns.js'
import { useAutosave } from '../../hooks/useAutosave.js'
import { useEssayLogger } from '../../hooks/useEssayLogger.js'
import PassageViewer from './PassageViewer.jsx'
import EssayEditor from '../../components/EssayEditor.jsx'
import SaveStateLabel from '../../components/SaveStateLabel.jsx'

export default function EssayWritePage() {
  const { assignmentId } = useParams()
  const navigate = useNavigate()
  const { user, userInfo } = useAuth()

  const [assignment, setAssignment] = useState(null)
  const [passage, setPassage] = useState(null)
  const [submission, setSubmission] = useState(null)
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

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
        let p
        try {
          p = await getPassage(a.passageId)
        } catch (err) {
          throw new Error(`지문 정보 접근 실패: ${err.message || err.code || '권한 또는 네트워크 오류'}`)
        }
        if (!p) throw new Error('연결된 지문을 찾을 수 없습니다. 선생님께 알려주세요.')

        let sub
        try {
          sub = await getOrCreateSubmission(assignmentId, {
            uid: user.uid,
            name: userInfo?.name || user.displayName || '',
            class: userInfo?.class || ''
          })
        } catch (err) {
          throw new Error(`내 작성 공간 생성 실패: ${err.message || err.code || '권한 또는 네트워크 오류'}`)
        }
        if (cancelled) return
        setAssignment(a)
        setPassage(p)
        setSubmission(sub)
        setText(sub.text || '')
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
    const aiFlags = scanText(value)
    await saveSubmissionDraft(submission.id, { text: value, charCount: value.length, aiFlags })
  }, { delay: 700 })

  const { logInput, logKeydown, logPaste, flushNow: flushLogs } = useEssayLogger(submission?.id)

  function handleChange(value) {
    setText(value)
    if (!locked) trigger(value)
  }

  async function handleSubmit() {
    if (!window.confirm('제출하시겠어요? 제출 후에는 선생님이 다시 열어주기 전까지 수정할 수 없습니다.')) return
    setSubmitting(true)
    try {
      await flushNow()
      await flushLogs()
      const aiFlags = scanText(text)
      await submitSubmission(submission.id, { text, charCount: text.length, aiFlags })
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
          본인이 직접 작성해야 하며, 작성 과정이 함께 기록됩니다. 목표 분량은 {wordLimit}자 내외입니다.
          {isPastDue && !locked && <span className="text-red-600 font-medium"> · 마감일이 지났습니다.</span>}
        </p>
      </div>

      <main className="flex-1 p-4 max-w-6xl mx-auto w-full min-h-0">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:h-[calc(100vh-160px)]">
          {/* min-h-0: flex/grid 항목은 기본적으로 내용 높이만큼 늘어나려 해서, 지정한 높이(h-full) 안에서
              PassageViewer 자체의 overflow-y-auto가 실제로 동작하려면 이 min-h-0이 꼭 필요하다. */}
          <div className="min-h-0 h-[50vh] lg:h-full">
            <PassageViewer passage={passage} />
          </div>
          <div className="flex flex-col min-h-0 h-[60vh] lg:h-full">
            {passage?.questionPrompt && (
              <div className="flex-shrink-0 rounded-xl bg-indigo-50 border border-indigo-100 p-3 mb-3">
                <p className="text-xs font-bold text-indigo-700 mb-1">📝 논술 문항</p>
                <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{passage.questionPrompt}</p>
              </div>
            )}
            <div className="flex-1 min-h-0">
              <EssayEditor
                value={text}
                onChange={handleChange}
                disabled={locked}
                wordLimitGuide={wordLimit}
                onLogInput={logInput}
                onLogKeydown={logKeydown}
                onLogPaste={logPaste}
              />
            </div>
            {!locked && (
              <button
                onClick={handleSubmit}
                disabled={submitting || text.trim().length === 0}
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
