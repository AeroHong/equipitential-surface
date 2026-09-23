import React, { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../App.jsx'
import {
  getAssignment, getPassage, getOrCreateSubmission,
  saveSubmissionDraft, submitSubmission, saveSectionsDraft, submitSections
} from '../../services/essay.js'
import { getTemplate } from '../../services/reportTemplates.js'
import { setManualStudentIdentity } from '../../services/users.js'
import { scanText } from '../../utils/aiPatterns.js'
import { htmlToPlainText } from '../../utils/richText.js'
import { useAutosave } from '../../hooks/useAutosave.js'
import { useEssayLogger } from '../../hooks/useEssayLogger.js'
import { usePresence } from '../../hooks/usePresence.js'
import PassageViewer from './PassageViewer.jsx'
import EssayEditor from '../../components/EssayEditor.jsx'
import StructuredReportEditor from './StructuredReportEditor.jsx'
import SaveStateLabel from '../../components/SaveStateLabel.jsx'
import CalculatorPanel from '../../components/CalculatorPanel.jsx'

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

  // 클래스룸 연동 없이 개인 구글 계정으로 접속한 경우에만 쓰는 학번·이름 수동 입력 상태.
  const [needsIdentity, setNeedsIdentity] = useState(false)
  const [studentIdInput, setStudentIdInput] = useState('')
  const [studentNameInput, setStudentNameInput] = useState('')
  const [identityError, setIdentityError] = useState('')
  const [savingIdentity, setSavingIdentity] = useState(false)

  const isStructured = assignment?.responseType === 'structured'
  const isEssayCalculatorType = assignment?.responseType === 'essay_calculator'
  // 공학용 계산기는 essay_calculator 안에서도 켜고 끌 수 있는 별도 체크박스다(과목 무관
  // 플랫폼이라 이 유형을 고른다고 계산기가 자동으로 붙지는 않음) — 양식/채점 여부와는
  // 독립적이라 assignment.calculatorEnabled를 따로 확인한다.
  const calculatorEnabled = isEssayCalculatorType && assignment?.calculatorEnabled === true
  // essay_calculator는 답변 방식 자체가 structured와 같다(양식의 문항별로 따로 입력) —
  // 계산기 체크박스와 무관하게 편집기 선택/제출 검증/자동저장 분기는 usesSections로 묶는다.
  const usesSections = isStructured || isEssayCalculatorType
  const [calculatorSheetOpen, setCalculatorSheetOpen] = useState(false)
  // 데스크톱 상시 패널은 `hidden lg:block`로 CSS만 숨기면 좁은 화면에서도 계산기 컴포넌트가
  // 계속 마운트된 채로 남아있다 — 모바일에서 바텀시트를 열면 두 번째 GeoGebra 인스턴스가
  // 동시에 뜨게 되는데, 실제로 테스트해보니 같은 페이지에 GeoGebra 인스턴스가 여러 개
  // 동시에 존재하면 렌더링이 불안정해졌다(화면이 비는 경우 발생). 그래서 데스크톱 패널
  // 자체를 이 상태로 조건부 마운트해 항상 하나만 존재하게 한다.
  const [isDesktopViewport, setIsDesktopViewport] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
  )
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const handleChange = e => setIsDesktopViewport(e.matches)
    mq.addEventListener('change', handleChange)
    return () => mq.removeEventListener('change', handleChange)
  }, [])

  // 계산기 패널 폭을 드래그로 조절 — splitRef(왼쪽 작성 영역 + 계산기를 함께 감싼 flex 행)의
  // 오른쪽 끝에서 포인터 x좌표까지의 거리를 그대로 계산기 폭으로 쓴다.
  // GeoGebra는 컨테이너가 주입되는 "그 순간" 크기에만 맞추고 이후 크기 변화는 따라가지
  // 않는다(CalculatorPanel.jsx 상단 주석 참고 — 실제로 여러 방법을 시도했지만 실시간
  // 리사이즈는 신뢰할 수 없었음). 그래서 패널 폭(calcPanelWidth)은 드래그 중 매끄럽게
  // 바뀌지만, CalculatorPanel 자체는 손을 뗀 시점(calcPanelCommittedWidth)에만 key를 바꿔
  // 새로 마운트해서 깔끔하게 다시 맞춘다 — 드래그 중에는 계산기 크기가 그대로 있다가, 놓는
  // 순간 한 번에 맞는 크기로 다시 그려진다.
  const splitRef = useRef(null)
  const draggingRef = useRef(false)
  const calcWidthRef = useRef(340)
  const [calcPanelWidth, setCalcPanelWidth] = useState(340)
  const [calcPanelCommittedWidth, setCalcPanelCommittedWidth] = useState(340)
  const MIN_CALC_WIDTH = 260
  const MAX_CALC_WIDTH = 640

  function handleDividerPointerDown(e) {
    draggingRef.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }
  function handleDividerPointerMove(e) {
    if (!draggingRef.current || !splitRef.current) return
    const rect = splitRef.current.getBoundingClientRect()
    const nextWidth = Math.min(MAX_CALC_WIDTH, Math.max(MIN_CALC_WIDTH, rect.right - e.clientX))
    calcWidthRef.current = nextWidth
    setCalcPanelWidth(nextWidth)
  }
  function handleDividerPointerUp(e) {
    draggingRef.current = false
    e.currentTarget.releasePointerCapture(e.pointerId)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    setCalcPanelCommittedWidth(calcWidthRef.current)
  }

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
        if (cancelled) return
        setAssignment(a)

        // 클래스룸 연동 없이 개인 구글 계정으로 접속한 경우(=로그인 계정 도메인이 이 배정을
        // 만든 교사의 도메인과 다름), 구글 표시 이름만으론 본인 확인이 안 되므로 학번·이름을
        // 먼저 받는다. 한 번 입력하면 users/{uid}.manualIdentity에 저장되어(services/users.js)
        // 다음부턴(다른 배정에서도) 다시 묻지 않는다. 같은 도메인이면 지금처럼 그대로 통과.
        const studentDomain = user.email?.includes('@') ? user.email.split('@')[1] : ''
        const isForeignAccount = Boolean(a.teacherDomain) && Boolean(studentDomain) && studentDomain !== a.teacherDomain
        if (isForeignAccount && !userInfo?.manualIdentity) {
          setNeedsIdentity(true)
          setLoading(false)
          return
        }
        setNeedsIdentity(false)

        // 지문은 이제 선택 사항이다 — structured/essay_calculator 응답은 지문 없이 배정될 수 있다.
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
        if (a.responseType === 'structured' || a.responseType === 'essay_calculator') {
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
            class: userInfo?.class || '',
            email: user.email || ''
          }, a.createdBy, tpl?.sections)
        } catch (err) {
          throw new Error(`내 작성 공간 생성 실패: ${err.message || err.code || '권한 또는 네트워크 오류'}`)
        }
        if (cancelled) return
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

  async function handleIdentitySubmit(e) {
    e.preventDefault()
    if (!studentIdInput.trim() || !studentNameInput.trim()) {
      setIdentityError('학번과 이름을 모두 입력해주세요.')
      return
    }
    setSavingIdentity(true)
    setIdentityError('')
    try {
      await setManualStudentIdentity(user.uid, { studentId: studentIdInput, name: studentNameInput })
      // users/{uid} 실시간 구독(App.jsx)이 userInfo를 갱신하면, 위 useEffect가 그 변화를 보고
      // 자동으로 다시 실행되어 배정을 마저 불러온다 — 여기서 따로 다시 부를 필요가 없다.
    } catch (err) {
      console.error('학번·이름 저장 실패:', err)
      setIdentityError('저장 중 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setSavingIdentity(false)
    }
  }

  const locked = submission?.status === 'submitted' || assignment?.status === 'closed'

  const { saveState, trigger, flushNow } = useAutosave(async (value) => {
    if (usesSections) {
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
  const { updateTyping } = usePresence({ assignmentId, uid: user?.uid, enabled: !locked })

  // 작성 로그(리플레이용)와 presence("입력 중" 표시)는 같은 입력 이벤트에서 함께 갱신한다 —
  // 로깅 자체는 useEssayLogger가, 실시간 "입력 중" 표시는 usePresence가 각자 책임진다.
  function handleLogInput(entry) {
    logInput(entry)
    updateTyping()
  }
  function handleLogKeydown(k, sectionId) {
    logKeydown(k, sectionId)
    updateTyping()
  }

  function handleTextChange(value) {
    setText(value)
    if (!locked) trigger(value)
  }

  function handleSectionsChange(nextSections) {
    setSections(nextSections)
    if (!locked) trigger(nextSections)
  }

  const requiredMissing = usesSections
    ? (template?.sections || []).filter(s => s.required && !htmlToPlainText(sections[s.id]?.text || '').trim())
    : []
  const canSubmit = usesSections
    ? requiredMissing.length === 0
    : htmlToPlainText(text).trim().length > 0

  async function handleSubmit() {
    if (usesSections && requiredMissing.length > 0) {
      alert(`아직 채우지 않은 필수 항목이 있습니다: ${requiredMissing.map(s => s.heading || s.groupLabel).join(', ')}`)
      return
    }
    if (!window.confirm('제출하시겠어요? 제출 후에는 선생님이 다시 열어주기 전까지 수정할 수 없습니다.')) return
    setSubmitting(true)
    try {
      await flushNow()
      await flushLogs()
      if (usesSections) {
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

  if (needsIdentity) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 px-4">
        <form onSubmit={handleIdentitySubmit} className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <p className="text-3xl mb-2 text-center">🙋</p>
          <p className="text-gray-800 font-bold text-center mb-1">학번과 이름을 알려주세요</p>
          <p className="text-gray-400 text-xs text-center mb-5">
            학교 계정이 아닌 개인 계정으로 접속하셨어요. 작성 기록을 본인 것으로 정확히 남기기 위해 한 번만 입력하면 다음부터는 다시 묻지 않습니다.
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">학번</label>
              <input
                value={studentIdInput}
                onChange={e => setStudentIdInput(e.target.value)}
                placeholder="예: 10305"
                autoFocus
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">이름</label>
              <input
                value={studentNameInput}
                onChange={e => setStudentNameInput(e.target.value)}
                placeholder="예: 홍길동"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
              />
            </div>
          </div>
          {identityError && <p className="text-xs text-red-500 mt-3">{identityError}</p>}
          <button
            type="submit"
            disabled={savingIdentity}
            className="mt-5 w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:opacity-40 transition-colors"
          >
            {savingIdentity ? '저장 중...' : '확인'}
          </button>
        </form>
      </div>
    )
  }

  const isPastDue = assignment.dueAt?.toDate ? assignment.dueAt.toDate() < new Date() : false
  const wordLimit = assignment.wordLimit || passage?.wordLimitGuide || 800

  // 채점 결과는 essay_calculator이고 교사가 공개(scoreReleased)했을 때만 보여준다 — 저장은
  // 미리 해둬도 "공개" 전까지는 학생 화면에 나타나지 않는다(services/essay.js의 saveGrading/
  // setScoreReleased가 서로 다른 동작인 이유).
  const showScores = isEssayCalculatorType && submission?.scoreReleased
  const sectionScores = showScores
    ? Object.fromEntries((template?.sections || []).map(sec => [sec.id, { score: submission.sections?.[sec.id]?.score ?? null, maxScore: sec.maxScore ?? null }]))
    : null
  const totalMaxScore = (template?.sections || []).reduce((sum, s) => sum + (s.maxScore || 0), 0)

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
          {showScores && (
            <span className="text-xs bg-indigo-100 text-indigo-700 rounded-full px-3 py-1 font-medium">
              총점 {submission.totalScore ?? 0}{totalMaxScore > 0 ? ` / ${totalMaxScore}` : ''}
            </span>
          )}
        </div>
      </header>

      {/* 안내 배너 */}
      <div className="bg-indigo-50 border-b border-indigo-100 px-4 py-2 text-center">
        <p className="text-xs text-indigo-700">
          본인이 직접 작성해야 하며, 작성 과정이 함께 기록됩니다.{' '}
          {usesSections ? '각 항목의 안내에 따라 빠짐없이 작성해주세요.' : `목표 분량은 ${wordLimit}자 내외입니다.`}
          {isPastDue && !locked && <span className="text-red-600 font-medium"> · 마감일이 지났습니다.</span>}
        </p>
      </div>

      <main className={`flex-1 p-4 mx-auto w-full min-h-0 ${calculatorEnabled ? 'max-w-[1440px]' : 'max-w-6xl'}`}>
        {/* calculatorEnabled일 때만 오른쪽에 계산기 칼럼을 위한 flex 래퍼를 씌운다 — 아래
            지문/작성 영역 그리드 자체의 내부 구조는 그대로 두고 감싸기만 해서, 계산기가 없는
            일반 배정의 레이아웃/DOM은 예전과 동일하게 유지된다. */}
        <div ref={splitRef} className={calculatorEnabled ? 'flex flex-col lg:flex-row lg:gap-0 gap-5 items-start' : ''}>
          <div className={calculatorEnabled ? 'min-w-0 flex-1' : ''}>
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

                {usesSections ? (
                  <StructuredReportEditor
                    template={template}
                    sections={sections}
                    onChange={handleSectionsChange}
                    disabled={locked}
                    logInput={handleLogInput}
                    logKeydown={handleLogKeydown}
                    logPaste={logPaste}
                    scores={sectionScores}
                  />
                ) : (
                  <EssayEditor
                    value={text}
                    onChange={handleTextChange}
                    disabled={locked}
                    wordLimitGuide={wordLimit}
                    onLogInput={handleLogInput}
                    onLogKeydown={handleLogKeydown}
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
          </div>

          {calculatorEnabled && (
            <>
              {/* 데스크톱(lg 이상)에서만 보이는 드래그 구분선 — 가운데 얇은 손잡이를 좌우로
                  끌면 패널 폭(calcPanelWidth)이 매끄럽게 바뀌고, 손을 뗄 때(calcPanelCommittedWidth)
                  CalculatorPanel이 새 key로 다시 마운트되면서 그 폭에 맞게 깔끔하게 다시 그려진다. */}
              <div
                className="hidden lg:flex w-3 flex-shrink-0 cursor-col-resize touch-none items-stretch justify-center self-stretch"
                style={{ height: 'calc(100vh - 160px)' }}
                onPointerDown={handleDividerPointerDown}
                onPointerMove={handleDividerPointerMove}
                onPointerUp={handleDividerPointerUp}
                role="separator"
                aria-orientation="vertical"
                aria-label="계산기 폭 조절"
              >
                <div className="my-4 w-1 rounded-full bg-gray-200 hover:bg-indigo-300" />
              </div>

              {/* 데스크톱(lg 이상): 항상 보이는 오른쪽 패널, 폭은 calcPanelWidth(드래그로 조절).
                  CalculatorPanel 자체를 isDesktopViewport로 조건부 마운트한다(위 주석 참고) —
                  GeoGebra 인스턴스가 모바일 바텀시트와 동시에 두 개 뜨지 않게. key를
                  calcPanelCommittedWidth로 줘서 드래그가 끝난 폭으로 다시 마운트되게 한다. */}
              <div
                className="hidden lg:block shrink-0 sticky top-4 h-[calc(100vh-160px)]"
                style={{ width: calcPanelWidth }}
              >
                {isDesktopViewport && <CalculatorPanel key={calcPanelCommittedWidth} />}
              </div>

              {/* 모바일/좁은 태블릿(lg 미만): 플로팅 버튼 + 바텀시트로 열고 닫음 */}
              <button
                type="button"
                onClick={() => setCalculatorSheetOpen(true)}
                className="fixed bottom-5 right-5 z-[1300] flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-2xl text-white shadow-lg transition-transform hover:bg-indigo-700 active:scale-95 lg:hidden"
                aria-label="공학용 계산기 열기"
              >
                🧮
              </button>

              {calculatorSheetOpen && (
                <div
                  className="fixed inset-0 z-[1400] flex items-end justify-center bg-slate-900/35 p-3 sm:items-center lg:hidden"
                  role="presentation"
                  onMouseDown={e => { if (e.target === e.currentTarget) setCalculatorSheetOpen(false) }}
                >
                  <div className="flex h-[72vh] max-h-[620px] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label="공학용 계산기">
                    <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-100 px-4 py-2">
                      <p className="text-sm font-bold text-gray-800">🧮 공학용 계산기</p>
                      <button type="button" onClick={() => setCalculatorSheetOpen(false)} className="text-xl text-slate-400 hover:text-slate-700" aria-label="계산기 닫기">×</button>
                    </div>
                    <div className="min-h-0 flex-1 p-2">
                      <CalculatorPanel />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
