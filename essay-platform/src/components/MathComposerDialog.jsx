import React, { useEffect, useMemo, useRef, useState } from 'react'
import { MATH_TEMPLATES, createMathExpression, normalizeMathExpression } from '../utils/mathExpression.js'

const SYMBOL_GROUPS = [
  ['연산', ['+', '−', '×', '÷', '±', '=', '≠', '≤', '≥', '≈']],
  ['문자', ['x', 'y', 'z', 'a', 'b', 'n', 'α', 'β', 'γ', 'θ', 'π', 'Δ']],
  ['집합·기타', ['∞', '∈', '∉', '⊂', '∪', '∩', '→', '°']]
]

const TEMPLATE_GLYPHS = {
  plain: 'x', fraction: '⁄', power: 'x²', subscript: 'xₙ', sqrt: '√x', brackets: '(x)',
  absolute: '|x|', limit: 'lim', sum: 'Σ', integral: '∫', matrix: '▦'
}

export default function MathComposerDialog({ initialExpression, initialMode = 'inline', onCancel, onConfirm }) {
  const [expression, setExpression] = useState(() => normalizeMathExpression(initialExpression || createMathExpression()))
  const [mode, setMode] = useState(initialMode)
  const [activeSlot, setActiveSlot] = useState(null)
  const inputRefs = useRef({})
  const firstSlot = useMemo(() => MATH_TEMPLATES.find(t => t.id === expression.template)?.slots?.[0]?.[0], [expression.template])

  useEffect(() => {
    const timer = setTimeout(() => inputRefs.current[firstSlot]?.focus(), 0)
    return () => clearTimeout(timer)
  }, [firstSlot])

  useEffect(() => {
    const close = e => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onCancel])

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
    const next = `${input.value.slice(0, start)}${symbol}${input.value.slice(end)}`
    setValue(key, next)
    requestAnimationFrame(() => { input.focus(); input.setSelectionRange(start + symbol.length, start + symbol.length) })
  }
  function submit(e) {
    e.preventDefault()
    onConfirm(expression, mode)
  }

  function slot(key, placeholder = '') {
    return (
      <input
        ref={el => { inputRefs.current[key] = el }}
        value={expression.values[key]}
        onFocus={() => setActiveSlot(key)}
        onChange={e => setValue(key, e.target.value)}
        aria-label={placeholder || key}
        placeholder={placeholder}
        className="min-w-0 bg-transparent text-center text-lg text-slate-800 outline-none placeholder:text-indigo-200"
      />
    )
  }

  function expressionField() {
    switch (expression.template) {
      case 'fraction': return <span className="inline-flex flex-col items-stretch min-w-24"><span className="border-b border-slate-500 px-1">{slot('top', '□')}</span><span className="px-1">{slot('bottom', '□')}</span></span>
      case 'power': return <span className="inline-flex items-start"><span className="w-24 border-b border-dotted border-indigo-200">{slot('base', '□')}</span><sup className="w-16 border-b border-dotted border-indigo-200 text-sm">{slot('exponent', '□')}</sup></span>
      case 'subscript': return <span className="inline-flex items-end"><span className="w-24 border-b border-dotted border-indigo-200">{slot('base', '□')}</span><sub className="w-16 border-b border-dotted border-indigo-200 text-sm">{slot('subscript', '□')}</sub></span>
      case 'sqrt': return <span className="inline-flex items-center text-3xl">√<span className="w-44 border-t border-slate-500 pt-1">{slot('body', '□')}</span></span>
      case 'brackets': return <span className="inline-flex items-center text-3xl">(<span className="w-48 text-lg border-b border-dotted border-indigo-200">{slot('body', '□')}</span>)</span>
      case 'absolute': return <span className="inline-flex items-center text-3xl">|<span className="w-48 text-lg border-b border-dotted border-indigo-200">{slot('body', '□')}</span>|</span>
      case 'limit': return <span className="inline-flex items-center gap-2"><span className="inline-flex flex-col items-center leading-none"><b className="font-serif text-xl">lim</b><span className="flex text-xs"><span className="w-10 border-b border-dotted border-indigo-200">{slot('variable', 'x')}</span>→<span className="w-10 border-b border-dotted border-indigo-200">{slot('target', 'a')}</span></span></span><span className="w-40 border-b border-dotted border-indigo-200">{slot('body', '□')}</span></span>
      case 'sum': return <span className="inline-flex items-center gap-2"><span className="inline-flex flex-col items-center leading-none"><span className="w-14 text-xs border-b border-dotted border-indigo-200">{slot('upper', 'n')}</span><b className="text-4xl font-normal">Σ</b><span className="w-14 text-xs border-b border-dotted border-indigo-200">{slot('lower', 'i=1')}</span></span><span className="w-40 border-b border-dotted border-indigo-200">{slot('body', '□')}</span></span>
      case 'integral': return <span className="inline-flex items-center gap-2"><span className="inline-flex flex-col items-center leading-none"><span className="w-14 text-xs border-b border-dotted border-indigo-200">{slot('upper', 'b')}</span><b className="text-4xl font-normal">∫</b><span className="w-14 text-xs border-b border-dotted border-indigo-200">{slot('lower', 'a')}</span></span><span className="w-40 border-b border-dotted border-indigo-200">{slot('body', 'f(x)')}</span><span>dx</span></span>
      case 'matrix': return <span className="inline-flex items-center text-3xl">[<span className="w-52 text-base border-b border-dotted border-indigo-200">{slot('cells', 'a,b;c,d')}</span>]</span>
      default: return <span className="w-72 max-w-full border-b border-dotted border-indigo-300">{slot('main', '식 입력')}</span>
    }
  }

  return (
    <div className="fixed inset-0 z-[1400] flex items-end sm:items-center justify-center bg-slate-900/35 p-3" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onCancel() }}>
      <form onSubmit={submit} className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl bg-white shadow-2xl border border-slate-200 p-4 sm:p-5" role="dialog" aria-modal="true" aria-labelledby="math-dialog-title">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div><h2 id="math-dialog-title" className="font-bold text-slate-900">수식 입력</h2><p className="text-xs text-slate-500 mt-0.5">기호를 고른 뒤 수식 안에서 바로 입력하세요.</p></div>
          <button type="button" onClick={onCancel} className="text-slate-400 hover:text-slate-700 text-xl" aria-label="수식 입력 닫기">×</button>
        </div>
        <div className="flex rounded-lg bg-slate-100 p-1 mb-4 w-fit">
          {[['inline', '문장 안'], ['block', '한 줄 수식']].map(([value, label]) => <button key={value} type="button" onClick={() => setMode(value)} className={`px-3 py-1.5 rounded-md text-xs font-medium ${mode === value ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}>{label}</button>)}
        </div>
        <div className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-2 scrollbar-thin" aria-label="수식과 기호 팔레트">
          {MATH_TEMPLATES.map(template => <button key={template.id} type="button" title={template.label} aria-label={template.label} onClick={() => chooseTemplate(template.id)} className={`flex-none min-w-10 h-9 rounded-lg border px-2 text-base ${expression.template === template.id ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:bg-indigo-50'}`}>{TEMPLATE_GLYPHS[template.id]}</button>)}
          <span className="my-1 w-px flex-none bg-slate-200" />
          {SYMBOL_GROUPS.flatMap(([, symbols]) => symbols).map(symbol => <button key={symbol} type="button" onClick={() => insertSymbol(symbol)} className="flex-none min-w-9 h-9 rounded-lg border border-slate-200 bg-white px-1 text-base text-slate-700 hover:border-indigo-300 hover:bg-indigo-50">{symbol}</button>)}
        </div>
        <div className="mb-5 flex min-h-36 items-center justify-center overflow-x-auto rounded-xl border border-indigo-100 bg-indigo-50/40 px-5 py-6 text-slate-800">
          {expressionField()}
        </div>
        <div className="flex justify-end gap-2"><button type="button" onClick={onCancel} className="px-3 py-2 text-sm text-slate-500">취소</button><button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">수식 넣기</button></div>
      </form>
    </div>
  )
}
