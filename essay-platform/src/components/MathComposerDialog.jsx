import React, { useEffect, useMemo, useRef, useState } from 'react'
import katex from 'katex'
import { MATH_TEMPLATES, createMathExpression, isNestedExpression, mathToLatex, normalizeMathExpression } from '../utils/mathExpression.js'

const SYMBOLS = ['+', '−', '×', '÷', '±', '=', '≠', '≤', '≥', '≈', 'x', 'y', 'z', 'a', 'b', 'n', 'α', 'β', 'γ', 'θ', 'π', 'Δ', '∞', '∈', '∉', '⊂', '∪', '∩', '→', '°']

function EmptySlot({ className = '' }) {
  return <span className={`inline-block border border-dotted border-indigo-400 bg-white/70 ${className}`} />
}

/** PowerPoint 수식 리본과 비슷하게, 텍스트 라벨 대신 수식 구조 자체를 아이콘으로 보여준다. */
function TemplateIcon({ template }) {
  switch (template) {
    case 'fraction': return <span className="inline-flex flex-col items-center gap-0.5"><EmptySlot className="w-2.5 h-1.5" /><span className="w-4 border-t border-slate-600" /><EmptySlot className="w-2.5 h-1.5" /></span>
    case 'power': return <span className="inline-flex items-start"><EmptySlot className="w-2.5 h-2.5" /><EmptySlot className="mt-[-1px] w-1.5 h-1.5" /></span>
    case 'subscript': return <span className="inline-flex items-end"><EmptySlot className="w-2.5 h-2.5" /><EmptySlot className="mb-[-1px] w-1.5 h-1.5" /></span>
    case 'sqrt': return <span className="inline-flex items-center font-serif text-lg leading-none">√<span className="border-t border-slate-600 pl-0.5"><EmptySlot className="w-2.5 h-2.5" /></span></span>
    case 'brackets': return <span className="inline-flex items-center text-base">(<EmptySlot className="w-2.5 h-2.5" />)</span>
    case 'absolute': return <span className="inline-flex items-center text-base">|<EmptySlot className="w-2.5 h-2.5" />|</span>
    case 'limit': return <span className="inline-flex flex-col items-center leading-none"><span className="font-serif text-xs">lim</span><span className="flex items-center text-[7px]"><EmptySlot className="w-1.5 h-1.5" />→<EmptySlot className="w-1.5 h-1.5" /></span></span>
    case 'sum': return <span className="inline-flex flex-col items-center leading-none"><EmptySlot className="w-1.5 h-1.5" /><span className="text-lg">Σ</span><EmptySlot className="w-1.5 h-1.5" /></span>
    case 'integral': return <span className="inline-flex flex-col items-center leading-none"><EmptySlot className="w-1.5 h-1.5" /><span className="font-serif text-lg">∫</span><EmptySlot className="w-1.5 h-1.5" /></span>
    case 'matrix': return <span className="grid grid-cols-2 gap-px border-x border-slate-600 px-0.5"><EmptySlot className="w-1.5 h-1.5" /><EmptySlot className="w-1.5 h-1.5" /><EmptySlot className="w-1.5 h-1.5" /><EmptySlot className="w-1.5 h-1.5" /></span>
    default: return <EmptySlot className="w-3 h-3" />
  }
}

export default function MathComposerDialog({ initialExpression, initialMode = 'inline', onCancel, onConfirm }) {
  const [expression, setExpression] = useState(() => normalizeMathExpression(initialExpression || createMathExpression()))
  const [mode, setMode] = useState(initialMode)
  const [activeSlot, setActiveSlot] = useState(null)
  const [nestedSlot, setNestedSlot] = useState(null) // 지금 "수식 속 수식"을 편집 중인 슬롯 key
  const inputRefs = useRef({})
  const currentTemplate = useMemo(() => MATH_TEMPLATES.find(t => t.id === expression.template), [expression.template])
  const firstSlot = currentTemplate.slots[0][0]
  // 칸에 타이핑할 때마다 실제 KaTeX로 그린 결과를 바로 보여준다 — 빈 칸은 mathToLatex가
  // 작은 사각형(\square)으로 채워주므로 다 안 채워도 항상 렌더링된다.
  const livePreview = useMemo(() => {
    try {
      return katex.renderToString(mathToLatex(expression), { throwOnError: false, displayMode: mode === 'block' })
    } catch {
      return ''
    }
  }, [expression, mode])

  useEffect(() => {
    const timer = setTimeout(() => inputRefs.current[firstSlot]?.focus(), 0)
    return () => clearTimeout(timer)
  }, [firstSlot])

  useEffect(() => {
    // 중첩 수식 편집 창이 떠 있을 땐 Escape가 그 창만 닫아야 한다 — 그대로 두면 바깥 창의
    // 리스너도 같이 반응해서 두 창이 한 번에 닫혀버린다.
    const close = e => { if (e.key === 'Escape' && !nestedSlot) onCancel() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onCancel, nestedSlot])

  function chooseTemplate(template) {
    setExpression(createMathExpression(template))
    setActiveSlot(null)
  }
  function setValue(key, value) {
    setExpression(current => ({ ...current, values: { ...current.values, [key]: value } }))
  }
  function insertSymbol(symbol) {
    const key = activeSlot || firstSlot
    const input = inputRefs.current[key]
    if (!input) return
    const start = input.selectionStart ?? input.value.length
    const end = input.selectionEnd ?? start
    setValue(key, `${input.value.slice(0, start)}${symbol}${input.value.slice(end)}`)
    requestAnimationFrame(() => { input.focus(); input.setSelectionRange(start + symbol.length, start + symbol.length) })
  }
  function submit(e) {
    e.preventDefault()
    onConfirm(expression, mode)
  }
  function slot(key, width = 'w-20', size = 'text-lg') {
    const label = currentTemplate.slots.find(([slotKey]) => slotKey === key)?.[1] || key
    const value = expression.values[key]

    // 이 칸에 이미 "수식 속 수식"이 들어 있으면 입력칸 대신 렌더링된 미리보기를 보여주고,
    // 클릭하면 중첩 편집창을 다시 연다.
    if (isNestedExpression(value)) {
      const preview = katex.renderToString(mathToLatex(value), { throwOnError: false })
      return <span className={`relative inline-flex ${width} h-7 min-w-0 items-center justify-center gap-1 rounded-sm border border-indigo-300 bg-indigo-50/70 px-1`}>
        <button type="button" onClick={() => setNestedSlot(key)} aria-label={`${label} 수식 편집`} className="max-w-full overflow-hidden" dangerouslySetInnerHTML={{ __html: preview }} />
        <button type="button" onClick={() => setValue(key, '')} aria-label={`${label} 수식 지우기`} className="flex-none text-xs leading-none text-slate-400 hover:text-red-500">×</button>
      </span>
    }

    const filled = Boolean(value)
    return <span className="relative inline-flex items-center gap-0.5">
      <input
        ref={el => { inputRefs.current[key] = el }}
        value={value}
        onFocus={() => setActiveSlot(key)}
        onChange={e => setValue(key, e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }}
        aria-label={label}
        className={`${width} h-7 min-w-0 rounded-sm px-1 text-center ${size} outline-none transition-colors ${filled ? 'border-b border-indigo-200 bg-transparent focus:border-indigo-500' : 'border border-dotted border-indigo-400 bg-white/70 focus:border-solid focus:border-indigo-500'}`}
      />
      <button
        type="button"
        onClick={() => setNestedSlot(key)}
        title={`${label} 칸에 수식 삽입`}
        aria-label={`${label} 칸에 수식 삽입`}
        className="flex h-4 w-4 flex-none items-center justify-center rounded-full border border-indigo-200 text-[9px] font-serif italic leading-none text-indigo-400 hover:border-indigo-400 hover:text-indigo-600"
      >ƒ</button>
    </span>
  }
  function expressionField() {
    switch (expression.template) {
      case 'fraction': return <span className="inline-flex flex-col items-center gap-1"><span className="border-b border-slate-600 px-1 pb-1">{slot('top')}</span><span>{slot('bottom')}</span></span>
      case 'power': return <span className="inline-flex items-start"><span>{slot('base', 'w-24')}</span><sup>{slot('exponent', 'w-14', 'text-sm')}</sup></span>
      case 'subscript': return <span className="inline-flex items-end"><span>{slot('base', 'w-24')}</span><sub>{slot('subscript', 'w-14', 'text-sm')}</sub></span>
      case 'sqrt': return <span className="inline-flex items-center font-serif text-4xl leading-none">√<span className="border-t border-slate-600 pl-1 pt-1">{slot('body', 'w-44')}</span></span>
      case 'brackets': return <span className="inline-flex items-center text-4xl">(<span>{slot('body', 'w-48')}</span>)</span>
      case 'absolute': return <span className="inline-flex items-center text-4xl">|<span>{slot('body', 'w-48')}</span>|</span>
      case 'limit': return <span className="inline-flex items-center gap-3"><span className="inline-flex flex-col items-center leading-none"><b className="font-serif text-2xl">lim</b><span className="flex items-center text-xs">{slot('variable', 'w-10', 'text-xs')}→{slot('target', 'w-10', 'text-xs')}</span></span>{slot('body', 'w-40')}</span>
      case 'sum': return <span className="inline-flex items-center gap-3"><span className="inline-flex flex-col items-center"><span>{slot('upper', 'w-14', 'text-xs')}</span><b className="text-4xl font-normal leading-none">Σ</b><span>{slot('lower', 'w-14', 'text-xs')}</span></span>{slot('body', 'w-40')}</span>
      case 'integral': return <span className="inline-flex items-center gap-2"><span className="inline-flex flex-col items-center"><span>{slot('upper', 'w-14', 'text-xs')}</span><b className="font-serif text-4xl font-normal leading-none">∫</b><span>{slot('lower', 'w-14', 'text-xs')}</span></span>{slot('body', 'w-40')}<span>dx</span></span>
      case 'matrix': return <span className="inline-flex items-center text-4xl">[<span>{slot('cells', 'w-52', 'text-base')}</span>]</span>
      default: return slot('main', 'w-72')
    }
  }

  return <div className="fixed inset-0 z-[1400] flex items-end justify-center bg-slate-900/35 p-3 sm:items-center" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onCancel() }}>
    <form onSubmit={submit} className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:p-5" role="dialog" aria-modal="true" aria-labelledby="math-dialog-title">
      <div className="mb-4 flex items-start justify-between gap-3"><div><h2 id="math-dialog-title" className="font-bold text-slate-900">수식 입력</h2><p className="mt-0.5 text-xs text-slate-500">점선 칸을 클릭해 입력하고 Tab으로 다음 칸으로 이동하세요.</p></div><button type="button" onClick={onCancel} className="text-xl text-slate-400 hover:text-slate-700" aria-label="수식 입력 닫기">×</button></div>
      <div className="mb-4 flex w-fit rounded-lg bg-slate-100 p-1">{[['inline', '문장 안'], ['block', '한 줄 수식']].map(([value, label]) => <button key={value} type="button" onClick={() => setMode(value)} className={`rounded-md px-3 py-1.5 text-xs font-medium ${mode === value ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}>{label}</button>)}</div>
      <div className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-2" aria-label="수식과 기호 팔레트">
        {MATH_TEMPLATES.map(template => <button key={template.id} type="button" title={template.label} aria-label={template.label} onClick={() => chooseTemplate(template.id)} className={`flex h-10 w-11 flex-none items-center justify-center rounded-lg border ${expression.template === template.id ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:bg-indigo-50'}`}><TemplateIcon template={template.id} /></button>)}
        <span className="my-1 w-px flex-none bg-slate-200" />
        {SYMBOLS.map(symbol => <button key={symbol} type="button" onClick={() => insertSymbol(symbol)} className="h-10 min-w-10 flex-none rounded-lg border border-slate-200 bg-white px-1 text-base text-slate-700 hover:border-indigo-300 hover:bg-indigo-50">{symbol}</button>)}
      </div>
      <div className="mb-3 flex min-h-14 items-center justify-center overflow-x-auto rounded-xl border border-slate-200 bg-white px-4 py-3" aria-label="실시간 수식 미리보기">
        <span className="text-slate-900" dangerouslySetInnerHTML={{ __html: livePreview }} />
      </div>
      <div className="mb-5 flex min-h-36 items-center justify-center overflow-x-auto rounded-xl border border-indigo-100 bg-indigo-50/40 px-5 py-6 text-slate-800">{expressionField()}</div>
      <div className="flex justify-end gap-2"><button type="button" onClick={onCancel} className="px-3 py-2 text-sm text-slate-500">취소</button><button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">수식 넣기</button></div>
    </form>
    {nestedSlot && (
      <MathComposerDialog
        initialExpression={isNestedExpression(expression.values[nestedSlot]) ? expression.values[nestedSlot] : createMathExpression()}
        initialMode="inline"
        onCancel={() => setNestedSlot(null)}
        onConfirm={nestedExpression => { setValue(nestedSlot, nestedExpression); setNestedSlot(null) }}
      />
    )}
  </div>
}
