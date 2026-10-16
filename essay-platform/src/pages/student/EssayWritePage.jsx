import React, { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../App.jsx'
import {
  subscribeAssignment, getPassage, getOrCreateSubmission,
  saveSubmissionDraft, submitSubmission, saveSectionsDraft, submitSections, subscribeSubmission,
  recordDisplayMode
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
import PracticePanel from './PracticePanel.jsx'
import ExamTimer from '../../components/ExamTimer.jsx'
import { useServerTimeOffset } from '../../hooks/useServerTimeOffset.js'
import { getExamDeadlineMs, getPausedAtMs } from '../../utils/examTimer.js'
import { useFocusGuard } from '../../hooks/useFocusGuard.js'
import { isFocusGuardActive, detectDisplayMode } from '../../utils/focusGuard.js'
import FocusGuardOverlay from '../../components/FocusGuardOverlay.jsx'
import ExperimentReport from '../../components/experiment/ExperimentReport.jsx'
import { subscribeExperimentResult, buildExperimentUrl, EXPERIMENT_MODES } from '../../services/experiments.js'

export default function EssayWritePage() {
  const { assignmentId } = useParams()
  const navigate = useNavigate()
  const { user, userRole, userInfo } = useAuth()

  const [assignment, setAssignment] = useState(null)
  const [passage, setPassage] = useState(null)
  const [template, setTemplate] = useState(null)
  const [submission, setSubmission] = useState(null)
  const [text, setText] = useState('')
  const [sections, setSections] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // 실험 연결 배정: Motion Tracker가 써 넣는 experimentResults/{aid}__{uid}를 실시간 구독한다.
  // undefined = 아직 모름(로딩), null = 아직 제출 안 함.
  const [experimentResult, setExperimentResult] = useState(undefined)

  // 클래스룸 연동 없이 개인 구글 계정으로 접속한 경우에만 쓰는 학번·이름 수동 입력 상태.
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

  // 배정 문서는 일회성 조회가 아니라 실시간 구독한다 — 대기실(waitingRoomEnabled)에서 교사가
  // "평가 시작"(examStartedAt)을 누르는 순간을 새로고침 없이 알아채야 하기 때문. 덤으로 교사가
  // 마감(status: 'closed')하면 그 즉시 입력이 잠긴다.
  useEffect(() => {
    if (!user) return
    const unsub = subscribeAssignment(assignmentId, a => {
      if (!a) setError('존재하지 않는 과제입니다.')
      else setAssignment(a)
      setLoading(false)
    }, err => {
      setError(`과제 정보 접근 실패: ${err.message || err.code || '권한 또는 네트워크 오류'}`)
      setLoading(false)
    })
    return () => unsub()
  }, [assignmentId, user])

  // 클래스룸 연동 없이 개인 구글 계정으로 접속한 경우(=로그인 계정 도메인이 이 배정을
  // 만든 교사의 도메인과 다름), 구글 표시 이름만으론 본인 확인이 안 되므로 학번·이름을
  // 먼저 받는다. 한 번 입력하면 users/{uid}.manualIdentity에 저장되어(services/users.js)
  // 다음부턴(다른 배정에서도) 다시 묻지 않는다. 같은 도메인이면 지금처럼 그대로 통과.
  const studentDomain = user?.email?.includes('@') ? user.email.split('@')[1] : ''
  const isForeignAccount = Boolean(assignment?.teacherDomain) && Boolean(studentDomain) && studentDomain !== assignment.teacherDomain
  // 교사/관리자가 학생 화면을 테스트하는 경우엔 묻지 않는다 — 여기서 입력한 학번·이름이
  // users/{uid}.name을 덮어써서 관리자 헤더에 "99999-테스트학생"처럼 남는 버그가 있었다.
  const isStaffAccount = userRole === 'teacher' || userRole === 'super_admin' || userRole === 'teacher_pending'
  const needsIdentity = isForeignAccount && !isStaffAccount && !userInfo?.manualIdentity

  // 추가 응시: 교사가 결석생만 골라 마감을 풀면(services/essay.js openMakeupExam) 그 학생들만
  // 들어올 수 있다. 원래 회차 학생은 제출물을 불러오지도 않고 안내만 본다 — 대기실 배정은 시작
  // 시각이 초기화되므로, 불러오면 제출 안 된 제출물의 제한시간이 풀려버린다.
  const makeupEmails = assignment?.makeupEmails
  const makeupActive = Array.isArray(makeupEmails) && makeupEmails.length > 0 && assignment?.status !== 'closed'
  const makeupBlocked = makeupActive && !isStaffAccount && !makeupEmails.includes((user?.email || '').toLowerCase())

  // 대기실: 교사가 평가를 시작하기 전엔 지문·양식을 아예 불러오지 않고 제출물도 만들지 않는다
  // (startedAt이 실제 시작 시각을 가리키도록).
  const waiting = Boolean(assignment?.waitingRoomEnabled && !assignment?.examStartedAt && !submission)
  // 일시정지: 교사가 진행 중인 평가를 "대기실로 보내기"하면 작성 중인 학생도 문항·답안이 가려지고
  // 대기실 화면을 본다. 남은 시간은 멈추고(ExamTimer pausedAtMs), 재개하면 쓰던 답안으로 돌아온다.
  // 일시정지 중에 새로 들어온 학생은 제출물을 만들지 않고 대기실에 머문다.
  const pausedAtMs = getPausedAtMs(assignment)
  const paused = pausedAtMs != null
  const showWaitingRoom = waiting || paused
  const readyToLoadContent = Boolean(assignment) && !needsIdentity && !makeupBlocked && !waiting && !(paused && !submission)
  const contentLoadStartedRef = useRef(false)
  const serverOffsetMs = useServerTimeOffset()
  const serverOffsetRef = useRef(0)
  serverOffsetRef.current = serverOffsetMs
  const loadedAtRef = useRef(null)
  const [timeUp, setTimeUp] = useState(false)

  useEffect(() => {
    if (!readyToLoadContent || contentLoadStartedRef.current) return
    contentLoadStartedRef.current = true
    const a = assignment
    let cancelled = false
    async function loadContent() {
      try {
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
        // 방금 만든 제출물은 startedAt이 serverTimestamp() 센티널이라 시각을 못 읽는다 —
        // 대기실 없는 배정의 제한시간 기준으로 쓸 수 있게 지금(서버 기준) 시각을 기억해둔다.
        loadedAtRef.current = Date.now() + serverOffsetRef.current
        setPassage(p)
        setTemplate(tpl)
        setSubmission(sub)
        setText(sub.text || '')
        setSections(sub.sections || {})
      } catch (err) {
        console.error('과제 로드 실패:', err)
        if (!cancelled) setError(err.message || '과제를 불러오지 못했습니다.')
      }
    }
    loadContent()
    return () => {
      cancelled = true
      contentLoadStartedRef.current = false
    }
    // assignment 스냅샷이 바뀔 때마다(마감 등) 다시 불러오지 않도록, 로드 시작 조건만 본다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyToLoadContent, assignmentId, user])

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
      // users/{uid} 실시간 구독(App.jsx)이 userInfo를 갱신하면 needsIdentity가 false로 바뀌고,
      // 위 loadContent effect가 자동으로 배정을 마저 불러온다 — 여기서 따로 부를 필요가 없다.
    } catch (err) {
      console.error('학번·이름 저장 실패:', err)
      setIdentityError('저장 중 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setSavingIdentity(false)
    }
  }

  const hasExperiment = Boolean(assignment?.experiment)
  useEffect(() => {
    if (!hasExperiment || !user) return
    return subscribeExperimentResult(assignmentId, user.uid, setExperimentResult)
  }, [hasExperiment, assignmentId, user])

  // 내 제출물 실시간 구독 — 교사의 강제 제출·재열기·점수 공개가 새로고침 없이 반영된다.
  // 작성 중인 답안(text/sections 상태)은 건드리지 않고 submission 객체만 갱신한다 — 안 그러면
  // 자동저장 echo가 돌아올 때마다 입력 중인 내용이 덮여 커서가 튄다.
  const submissionId = submission?.id
  useEffect(() => {
    if (!submissionId) return
    return subscribeSubmission(submissionId, snap => {
      if (snap) setSubmission(prev => ({ ...prev, ...snap }))
    })
  }, [submissionId])

  // 제한시간: 교사가 다시 열어준 학생(timeLimitWaived)은 제외 — services/essay.js의 reopenSubmission 참고.
  const deadlineMs = submission && !submission.timeLimitWaived
    ? getExamDeadlineMs(assignment, submission, loadedAtRef.current)
    : null
  // 교사가 제한시간을 늘리거나 없애면(배정 실시간 구독) 아직 제출 전인 화면은 다시 풀린다.
  useEffect(() => {
    if (timeUp && (deadlineMs == null || deadlineMs > Date.now() + serverOffsetMs)) setTimeUp(false)
  }, [deadlineMs, timeUp, serverOffsetMs])

  const locked = submission?.status === 'submitted' || assignment?.status === 'closed' || timeUp
  // 교사가 강제 제출하는 등 잠긴 뒤엔 남은 자동저장을 버린다 — 규칙에 막혀 실패하면
  // useAutosave가 계속 재시도하고, 페이지를 떠날 때마다 "저장 중" 확인창이 뜨게 된다.
  // (잠기기 직전까지 쓴 내용은 제출(submitNow)이 직접 함께 저장한다.)
  const lockedRef = useRef(locked)
  lockedRef.current = locked

  const { saveState, trigger, flushNow } = useAutosave(async (value) => {
    if (lockedRef.current) return
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
  const { updateTyping } = usePresence({ assignmentId, uid: user?.uid, enabled: !locked && !makeupBlocked })

  // 작성 로그(리플레이용)와 presence("입력 중" 표시)는 같은 입력 이벤트에서 함께 갱신한다 —
  // 로깅 자체는 useEssayLogger가, 실시간 "입력 중" 표시는 usePresence가 각자 책임진다.
  // 화면 이탈 감지 — 제한시간이 있는 평가에서만(utils/focusGuard.js). 새로고침하면 전체화면이
  // 풀리므로 examEntered는 저장하지 않고 매번 시작 안내(전체화면 진입 버튼)부터 다시 거친다.
  // 교사가 "재열기"한 학생(timeLimitWaived)도 계속 감지한다 — 제한시간만 풀어주는 것이지 평가가
  // 끝난 게 아니다(예전엔 여기서 제외해서 재열기 뒤로 이탈이 더 안 잡혔다).
  const focusGuardOn = isFocusGuardActive(assignment) && Boolean(submission) && !locked && !paused
  const [examEntered, setExamEntered] = useState(false)
  // 일시정지되면 전체화면이 풀리므로(useFocusGuard가 정리), 재개할 때 시작 안내부터 다시 거친다.
  useEffect(() => {
    if (paused) setExamEntered(false)
  }, [paused])
  const focusGuard = useFocusGuard({ enabled: focusGuardOn && examEntered, submissionId: submission?.id, serverOffsetMs })

  async function handleExamEnter() {
    await focusGuard.enterFullscreen()
    setExamEntered(true)
    if (submission?.id) recordDisplayMode(submission.id, detectDisplayMode()).catch(() => {})
  }

  // 일시정지 직전까지 쓴 내용은 바로 저장해둔다(편집기가 가려지므로).
  useEffect(() => {
    if (paused) flushNow()
  }, [paused, flushNow])

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
    // 실험 결과 섹션은 글을 쓰는 칸이 아니라 제외 — 실험 제출 여부는 experimentMissing이 따로 본다
    ? (template?.sections || []).filter(s => s.type !== 'experiment' && s.required && !htmlToPlainText(sections[s.id]?.text || '').trim())
    : []
  const experimentMissing = hasExperiment && assignment.experiment.required !== false && !experimentResult
  const canSubmit = !experimentMissing && (usesSections
    ? requiredMissing.length === 0
    : htmlToPlainText(text).trim().length > 0)

  // 같은 탭에서 Motion Tracker로 이동한다 — 돌아올 때 return 링크로 이 화면이 다시 열리므로
  // 떠나기 전에 작성 중인 내용을 바로 저장해둔다.
  async function handleStartExperiment() {
    // flushNow는 이미 서버로 보내는 중인 저장까지 기다린다(useAutosave.js). 실패해도 이동은
    // 막지 않는다 — 브라우저 로컬 캐시(firebase.js)에 남은 쓰기가 돌아와서 다시 전송된다.
    try { await flushNow() } catch { /* 위 주석 참고 */ }
    window.location.href = buildExperimentUrl(assignmentId, assignment.experiment)
  }

  async function handleSubmit() {
    if (usesSections && requiredMissing.length > 0) {
      alert(`아직 채우지 않은 필수 항목이 있습니다: ${requiredMissing.map(s => s.heading || s.groupLabel).join(', ')}`)
      return
    }
    if (!window.confirm('제출하시겠어요? 제출 후에는 선생님이 다시 열어주기 전까지 수정할 수 없습니다.')) return
    await submitNow({ auto: false })
  }

  async function submitNow({ auto }) {
    setSubmitting(true)
    try {
      await flushNow()
      await flushLogs()
      if (usesSections) {
        const withAiFlags = Object.fromEntries(
          Object.entries(sections).map(([id, ans]) => [id, { ...ans, aiFlags: scanText(htmlToPlainText(ans.text || '')) }])
        )
        await submitSections(submission.id, withAiFlags, { auto })
      } else {
        const plainText = htmlToPlainText(text)
        const aiFlags = scanText(plainText)
        await submitSubmission(submission.id, { text, charCount: plainText.length, aiFlags }, { auto })
      }
      setSubmission(s => ({ ...s, status: 'submitted', autoSubmitted: auto }))
    } catch (err) {
      console.error('제출 실패:', err)
      // 자동 제출 실패(주로 네트워크)는 화면을 잠근 채로 두고 조용히 다시 시도한다 — 여기서
      // 풀어주면 시간이 지났는데도 계속 쓸 수 있게 된다.
      if (auto) window.setTimeout(() => submitNowRef.current({ auto: true }), 5000)
      else alert('제출 중 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setSubmitting(false)
    }
  }
  // 타이머 콜백과 재시도는 최신 작성 내용(sections/text)을 제출해야 해서 ref로 최신 함수를 잡는다.
  const submitNowRef = useRef(submitNow)
  submitNowRef.current = submitNow

  // 제한시간 종료: 입력을 즉시 잠그고, 필수 항목·확인창 없이 지금까지 쓴 내용으로 제출한다.
  function handleTimeExpired() {
    if (submission?.status === 'submitted') return
    setTimeUp(true)
    submitNowRef.current({ auto: true })
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

  if (makeupBlocked) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 px-4">
        <div className="text-center">
          <p className="text-3xl mb-2">🔒</p>
          <p className="text-gray-800 font-bold mb-1">마감된 평가입니다</p>
          <p className="text-gray-500 text-sm mb-4">지금은 추가 응시 대상 학생만 들어올 수 있습니다.</p>
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
      {focusGuardOn && !waiting && !examEntered && (
        <FocusGuardOverlay mode="start" onStart={handleExamEnter} />
      )}
      {focusGuardOn && examEntered && focusGuard.blocking && (
        <FocusGuardOverlay
          mode="warning"
          warning={focusGuard.warning}
          usingFullscreen={focusGuard.usingFullscreen}
          totalLeaveCount={Math.max(submission?.leaveCount || 0, focusGuard.leaveCount)}
          onAcknowledge={focusGuard.acknowledge}
        />
      )}
      {/* 전체화면이 풀린 건 이탈로 세지 않는다 — 돌아가기를 권하는 안내만 띄운다. */}
      {focusGuardOn && examEntered && !focusGuard.blocking && focusGuard.fullscreenLost && (
        <div className="fixed bottom-4 left-1/2 z-[1900] flex -translate-x-1/2 items-center gap-2 rounded-full border border-gray-200 bg-white py-1.5 pl-4 pr-1.5 text-xs text-gray-600 shadow-lg">
          전체화면이 해제되었습니다
          <button
            type="button"
            onClick={focusGuard.returnToFullscreen}
            className="rounded-full bg-indigo-600 px-3 py-1.5 font-medium text-white hover:bg-indigo-700"
          >
            전체화면으로
          </button>
          <button
            type="button"
            onClick={focusGuard.dismissFullscreenPrompt}
            aria-label="안내 닫기"
            className="rounded-full px-2 py-1.5 text-gray-400 hover:bg-gray-100"
          >
            ✕
          </button>
        </div>
      )}
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
          {waiting && (
            <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-3 py-1 font-medium">⏳ 평가 시작 대기 중</span>
          )}
          {paused && !waiting && (
            <span className="text-xs bg-slate-200 text-slate-700 rounded-full px-3 py-1 font-medium">⏸ 일시정지</span>
          )}
          {deadlineMs != null && submission?.status !== 'submitted' && assignment.status !== 'closed' && (
            <ExamTimer deadlineMs={deadlineMs} serverOffsetMs={serverOffsetMs} onExpire={handleTimeExpired} pausedAtMs={pausedAtMs} />
          )}
          {!locked && !showWaitingRoom && <SaveStateLabel state={saveState} />}
          {timeUp && submission?.status !== 'submitted' && (
            <span className="text-xs bg-red-100 text-red-700 rounded-full px-3 py-1 font-medium">시간 종료 · 제출 중...</span>
          )}
          {submission?.status === 'submitted' && (
            <span className="text-xs bg-green-100 text-green-700 rounded-full px-3 py-1 font-medium">
              {submission.forceSubmitted ? '선생님이 제출 처리함' : submission.autoSubmitted ? '⏱ 시간 종료로 자동 제출됨' : '✅ 제출 완료'}
            </span>
          )}
          {assignment.status === 'closed' && submission?.status !== 'submitted' && (
            <span className="text-xs bg-gray-100 text-gray-600 rounded-full px-3 py-1 font-medium">마감됨</span>
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
          {waiting ? '선생님이 평가를 시작하면 문항이 나타납니다. ' : paused ? '선생님이 평가를 잠시 멈췄습니다. 재개하면 작성하던 답안으로 돌아갑니다. ' : ''}
          본인이 직접 작성해야 하며, 작성 과정이 함께 기록됩니다.{' '}
          {usesSections ? '각 항목의 안내에 따라 빠짐없이 작성해주세요.' : `목표 분량은 ${wordLimit}자 내외입니다.`}
          {assignment.timeLimitMinutes > 0 && (
            <span className="font-medium">
              {' '}· 제한시간 {assignment.timeLimitMinutes}분{assignment.waitingRoomEnabled ? '(평가 시작부터)' : '(처음 들어온 때부터)'}, 시간이 끝나면 쓴 내용까지 자동 제출됩니다.
            </span>
          )}
          {isPastDue && !locked &&<span className="text-red-600 font-medium"> · 마감일이 지났습니다.</span>}
        </p>
      </div>

      <main className={`flex-1 p-4 mx-auto w-full min-h-0 ${calculatorEnabled ? 'max-w-[1440px]' : 'max-w-6xl'}`}>
        {/* calculatorEnabled일 때만 오른쪽에 계산기 칼럼을 위한 flex 래퍼를 씌운다 — 아래
            지문/작성 영역 그리드 자체의 내부 구조는 그대로 두고 감싸기만 해서, 계산기가 없는
            일반 배정의 레이아웃/DOM은 예전과 동일하게 유지된다. */}
        <div ref={splitRef} className={calculatorEnabled ? 'flex flex-col lg:flex-row lg:gap-0 gap-5 items-start' : ''}>
          <div className={calculatorEnabled ? 'min-w-0 flex-1' : ''}>
            {/* 대기실/로딩/본 화면을 이 칸 안에서만 바꾼다 — 오른쪽 계산기 칼럼은 그대로 마운트된 채
                남아서, 평가가 시작돼도 연습하며 계산해둔 내용이 사라지지 않는다. */}
            {showWaitingRoom ? (
              <PracticePanel calculatorEnabled={calculatorEnabled} paused={paused && !waiting} />
            ) : !submission ? (
              <div className="flex items-center justify-center py-24">
                <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
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

                {hasExperiment && (
                  <ExperimentCard
                    experiment={assignment.experiment}
                    result={experimentResult}
                    locked={locked}
                    onStart={handleStartExperiment}
                    inReport={usesSections && (template?.sections || []).some(s => s.type === 'experiment')}
                  />
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
                    experimentResult={experimentResult}
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
                {!locked && experimentMissing && (
                  <p className="mt-3 text-center text-xs text-amber-600">실험 결과를 먼저 제출해야 보고서를 제출할 수 있습니다.</p>
                )}
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
            )}
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

/** 작성 화면 위쪽의 실험 카드 — 시작/다시 하기 버튼과 제출된 결과 요약. */
function ExperimentCard({ experiment, result, locked, onStart, inReport = false }) {
  const modeLabel = EXPERIMENT_MODES[experiment.mode]?.label || '영상 분석'
  const done = Boolean(result)
  return (
    <div className={`flex-shrink-0 mb-3 rounded-xl border p-3 ${done ? 'border-emerald-200 bg-emerald-50/50' : 'border-amber-200 bg-amber-50'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-bold text-gray-800">🎥 실험: {modeLabel}</p>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${done ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
          {result === undefined ? '확인 중...' : done ? '결과 제출됨' : '아직 제출 안 함'}
        </span>
        {!locked && (
          <button
            type="button"
            onClick={onStart}
            className="ml-auto min-h-[44px] rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white hover:bg-indigo-700 active:scale-95"
          >
            {done ? '실험 다시 하기' : '실험 시작'}
          </button>
        )}
      </div>
      {!done && result !== undefined && (
        <p className="mt-1.5 text-xs text-gray-500">
          [실험 시작]을 누르면 Motion Tracker가 열립니다. 영상을 분석한 뒤 결과 화면에서 <b>"과제에 결과 제출"</b>을 누르고 이 화면으로 돌아오세요.
        </p>
      )}
      {/* 양식에 '실험 결과' 섹션이 있으면 보고서는 그 섹션에 들어가므로 여기서는 안내만 */}
      {done && (inReport
        ? <p className="mt-1.5 text-xs text-emerald-700">실험 보고서가 아래 "실험 결과" 섹션에 들어갔습니다. 다시 제출하면 최신 결과로 바뀝니다.</p>
        : <div className="mt-3"><ExperimentReport result={result} /></div>)}
    </div>
  )
}
