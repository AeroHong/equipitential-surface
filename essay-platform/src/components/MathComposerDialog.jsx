import React, { useEffect, useRef, useState } from 'react'
import { MathfieldElement } from 'mathlive'

// mathlive를 import하는 순간 <math-field> 커스텀 엘리먼트가 등록된다. 이 파일에서만
// import하므로 번들러가 자동으로 별도 청크로 분리한다(EssayEditor.jsx가 이 컴포넌트를
// lazy load하기 때문) — 수식 버튼을 한 번도 안 누르면 mathlive 코드가 아예 안 실린다.
// 폰트는 번들러가 처리 못 하는 방식(내부 문자열 CSS)으로 로드하므로, npm 패키지의
// fonts 폴더를 public/mathlive-fonts로 복사해두고 정적 경로를 지정한다(설정은 첫
// <math-field> 생성 전에 한 번만 하면 됨 — 모듈 로드 시 즉시 실행).
if (MathfieldElement.fontsDirectory !== '/mathlive-fonts') {
  MathfieldElement.fontsDirectory = '/mathlive-fonts'
}

// 클릭하면 커서 위치에 LaTeX 조각을 꽂아준다 — #?는 MathLive가 인식하는 빈 자리표시자로,
// 삽입 직후 첫 자리표시자로 포커스가 이동하고 Tab으로 다음 자리표시자, 화살표로 자유롭게
// 안팎을 넘나들 수 있다(전부 MathLive 내장 동작). 학생은 백슬래시 명령어를 직접 칠 필요가 없다.
const TEMPLATE_BUTTONS = [
  { key: 'fraction', label: '분수', glyph: '𝑎/𝑏', latex: '\\frac{#?}{#?}' },
  { key: 'power', label: '제곱·지수', glyph: '𝑥ⁿ', latex: '#?^{#?}' },
  { key: 'subscript', label: '아래첨자', glyph: '𝑥ₙ', latex: '#?_{#?}' },
  { key: 'sqrt', label: '제곱근', glyph: '√', latex: '\\sqrt{#?}' },
  { key: 'brackets', label: '괄호', glyph: '( )', latex: '\\left(#?\\right)' },
  { key: 'absolute', label: '절댓값', glyph: '| |', latex: '\\left|#?\\right|' },
  { key: 'limit', label: '극한', glyph: 'lim', latex: '\\lim_{#?\\to #?}#?' },
  { key: 'sum', label: '합', glyph: 'Σ', latex: '\\sum_{#?}^{#?}#?' },
  { key: 'integral', label: '적분', glyph: '∫', latex: '\\int_{#?}^{#?}#?\\,dx' },
  { key: 'matrix', label: '행렬', glyph: '[ ]', latex: '\\begin{pmatrix}#?&#?\\\\#?&#?\\end{pmatrix}' }
]

const SYMBOL_BUTTONS = [
  ['+', '+'], ['−', '-'], ['×', '\\times '], ['÷', '\\div '], ['±', '\\pm '],
  ['=', '='], ['≠', '\\ne '], ['≤', '\\le '], ['≥', '\\ge '], ['≈', '\\approx '],
  ['α', '\\alpha '], ['β', '\\beta '], ['γ', '\\gamma '], ['θ', '\\theta '], ['π', '\\pi '],
  ['Δ', '\\Delta '], ['∞', '\\infty '], ['∈', '\\in '], ['→', '\\to '], ['°', '\\degree '],
  // 기하 — "각도 기호가 없다"는 수학 선생님 제보로 추가
  ['∠', '\\angle '], ['△', '\\triangle '], ['⊥', '\\perp '], ['∥', '\\parallel '], ['∽', '\\backsim ']
]

export default function MathComposerDialog({ initialLatex, initialMode = 'inline', onCancel, onConfirm }) {
  const [mode, setMode] = useState(initialMode)
  const fieldRef = useRef(null)

  useEffect(() => {
    const field = fieldRef.current
    if (!field) return
    field.value = initialLatex || ''
    const timer = setTimeout(() => field.focus(), 0)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 안드로이드는 외장 키보드를 연결해도 입력이 키보드 앱(IME)을 거쳐 들어와서, Backspace가
  // keydown이 아니라 beforeinput(deleteContentBackward)으로만 온다 — MathLive가 이걸 처리하지
  // 않아 백스페이스가 먹지 않았다(실사용 신고: Del은 되는데 Backspace만 안 됨). 데스크톱/iOS는
  // MathLive가 keydown 단계에서 preventDefault하므로 beforeinput이 아예 안 와서 두 번 지워지지 않는다.
  useEffect(() => {
    const field = fieldRef.current
    if (!field) return
    const handleBeforeInput = e => {
      if (e.inputType === 'deleteContentBackward') {
        e.preventDefault()
        field.executeCommand('deleteBackward')
      } else if (e.inputType === 'deleteContentForward') {
        e.preventDefault()
        field.executeCommand('deleteForward')
      }
    }
    field.addEventListener('beforeinput', handleBeforeInput)
    return () => field.removeEventListener('beforeinput', handleBeforeInput)
  }, [])

  // 가상 키보드는 policy="manual" — 기본은 꺼져 있고, 학생이 수식 칸의 MathLive 키보드 버튼을
  // 눌러야 켜진다. "auto"에서는 터치 기기에서 포커스가 잡힐 때마다 MathLive가 키보드를 다시
  // 띄우는데, 끄기 버튼을 눌러도 MathLive가 내부적으로 포커스를 다시 잡아서(그리고 ◀▶⌫·서식
  // 버튼도 포커스를 잡아서) "항상 켜져 있는" 상태가 됐다(실사용 신고).
  // 키보드가 켜지면 그 높이만큼 창을 위로 밀어 올린다 — 안 그러면 키보드가 수식 칸을 가린다.
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  useEffect(() => {
    const kbd = window.mathVirtualKeyboard
    if (!kbd) return
    const update = () => setKeyboardHeight(kbd.visible ? (kbd.boundingRect?.height || 0) : 0)
    kbd.addEventListener('geometrychange', update)
    kbd.addEventListener('virtual-keyboard-toggle', update)
    return () => {
      kbd.removeEventListener('geometrychange', update)
      kbd.removeEventListener('virtual-keyboard-toggle', update)
      kbd.hide()
    }
  }, [])

  function runCommand(command) {
    fieldRef.current?.executeCommand(command)
    fieldRef.current?.focus()
  }

  useEffect(() => {
    const close = e => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onCancel])

  function insert(latex) {
    fieldRef.current?.insert(latex)
    fieldRef.current?.focus()
  }

  function submit(e) {
    e.preventDefault()
    const latex = fieldRef.current?.getValue('latex') || ''
    onConfirm(latex, mode)
  }

  return <div
    className="fixed inset-0 z-[1400] flex items-end justify-center bg-slate-900/35 p-3 sm:items-center"
    style={keyboardHeight ? { paddingBottom: keyboardHeight + 12, alignItems: 'flex-end' } : undefined}
    role="presentation"
    onMouseDown={e => { if (e.target === e.currentTarget) onCancel() }}
  >
    <form onSubmit={submit} className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:p-5" role="dialog" aria-modal="true" aria-labelledby="math-dialog-title">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 id="math-dialog-title" className="font-bold text-slate-900">수식 입력</h2>
          <p className="mt-0.5 text-xs text-slate-500">서식 버튼을 눌러 삽입하고, 그 안에 바로 타이핑하세요. 화살표 키로 자유롭게 이동하며 이어서 입력할 수 있습니다.</p>
        </div>
        <button type="button" onClick={onCancel} className="text-xl text-slate-400 hover:text-slate-700" aria-label="수식 입력 닫기">×</button>
      </div>

      <div className="mb-4 flex w-fit rounded-lg bg-slate-100 p-1">
        {[['inline', '문장 안'], ['block', '한 줄 수식']].map(([value, label]) => (
          <button key={value} type="button" onClick={() => setMode(value)} className={`rounded-md px-3 py-1.5 text-xs font-medium ${mode === value ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}>{label}</button>
        ))}
      </div>

      <div className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-2" aria-label="수식 서식과 기호 팔레트">
        {TEMPLATE_BUTTONS.map(t => (
          <button key={t.key} type="button" title={t.label} aria-label={t.label} onClick={() => insert(t.latex)} className="flex h-10 w-11 flex-none items-center justify-center rounded-lg border border-slate-200 bg-white text-base text-slate-700 hover:border-indigo-300 hover:bg-indigo-50">{t.glyph}</button>
        ))}
        <span className="my-1 w-px flex-none bg-slate-200" />
        {SYMBOL_BUTTONS.map(([glyph, latex]) => (
          <button key={glyph} type="button" onClick={() => insert(latex)} className="h-10 min-w-10 flex-none rounded-lg border border-slate-200 bg-white px-1 text-base text-slate-700 hover:border-indigo-300 hover:bg-indigo-50">{glyph}</button>
        ))}
      </div>

      {/* 태블릿에서 터치로 수식 중간에 커서를 놓기가 어려워서, 커서 이동·지우기를 버튼으로도 할 수 있게 한다.
          onMouseDown preventDefault: 버튼을 눌러도 수식 입력칸의 포커스(커서 위치)를 뺏지 않게. */}
      <div className="mb-2 flex items-center gap-1">
        {[
          ['moveToPreviousChar', '◀', '커서 왼쪽으로'],
          ['moveToNextChar', '▶', '커서 오른쪽으로'],
          ['deleteBackward', '⌫', '앞 글자 지우기']
        ].map(([command, glyph, label]) => (
          <button
            key={command}
            type="button"
            title={label}
            aria-label={label}
            onMouseDown={e => e.preventDefault()}
            onClick={() => runCommand(command)}
            className="h-10 min-w-12 rounded-lg border border-slate-200 bg-white px-3 text-base text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 active:bg-indigo-100"
          >
            {glyph}
          </button>
        ))}
        <span className="ml-2 text-xs text-slate-400">커서 이동·지우기</span>
      </div>

      <div className="mb-5 rounded-xl border border-indigo-100 bg-indigo-50/40 px-4 py-5">
        {/* eslint-disable-next-line react/no-unknown-property */}
        <math-field ref={fieldRef} math-virtual-keyboard-policy="manual" style={{ width: '100%', fontSize: '1.5rem', background: 'transparent' }} />
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-3 py-2 text-sm text-slate-500">취소</button>
        <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">수식 넣기</button>
      </div>
    </form>
  </div>
}
