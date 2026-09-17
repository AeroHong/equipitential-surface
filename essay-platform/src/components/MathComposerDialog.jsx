import React, { useEffect, useMemo, useRef, useState } from 'react'
import katex from 'katex'
import { MATH_TEMPLATES, createMathExpression, mathToLatex, normalizeMathExpression } from '../utils/mathExpression.js'

const SYMBOL_GROUPS = [
  ['연산', ['+', '−', '×', '÷', '±', '=', '≠', '≤', '≥', '≈']],
  ['문자', ['x', 'y', 'z', 'a', 'b', 'n', 'α', 'β', 'γ', 'θ', 'π', 'Δ']],
  ['집합·기타', ['∞', '∈', '∉', '⊂', '∪', '∩', '→', '°']]
]

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

  const currentTemplate = MATH_TEMPLATES.find(t => t.id === expression.template)
  const previewHtml = useMemo(() => katex.renderToString(mathToLatex(expression), { throwOnError: false, displayMode: mode === 'block' }), [expression, mode])
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

  return (
    <div className="fixed inset-0 z-[1400] flex items-end sm:items-center justify-center bg-slate-900/35 p-3" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onCancel() }}>
      <form onSubmit={submit} className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl bg-white shadow-2xl border border-slate-200 p-4 sm:p-5" role="dialog" aria-modal="true" aria-labelledby="math-dialog-title">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div><h2 id="math-dialog-title" className="font-bold text-slate-900">수식 입력</h2><p className="text-xs text-slate-500 mt-0.5">서식을 고르고 빈 칸을 채워보세요.</p></div>
          <button type="button" onClick={onCancel} className="text-slate-400 hover:text-slate-700 text-xl" aria-label="수식 입력 닫기">×</button>
        </div>
        <div className="flex rounded-lg bg-slate-100 p-1 mb-4 w-fit">
          {[['inline', '문장 안'], ['block', '한 줄 수식']].map(([value, label]) => <button key={value} type="button" onClick={() => setMode(value)} className={`px-3 py-1.5 rounded-md text-xs font-medium ${mode === value ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}>{label}</button>)}
        </div>
        <p className="text-xs font-semibold text-slate-600 mb-2">서식</p>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 mb-4">
          {MATH_TEMPLATES.map(template => <button key={template.id} type="button" onClick={() => chooseTemplate(template.id)} className={`rounded-lg border px-2 py-2 text-xs ${expression.template === template.id ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-semibold' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{template.label}</button>)}
        </div>
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 mb-4">
          <p className="text-xs font-semibold text-indigo-800 mb-2">{currentTemplate.label} 채우기</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {currentTemplate.slots.map(([key, label]) => <label key={key} className="text-xs text-slate-600"><span className="block mb-1">{label}</span><input ref={el => { inputRefs.current[key] = el }} value={expression.values[key]} onFocus={() => setActiveSlot(key)} onChange={e => setValue(key, e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-200" placeholder={`${label} 입력`} /></label>)}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 mb-4 min-h-12 overflow-x-auto text-center" aria-label="수식 미리보기" dangerouslySetInnerHTML={{ __html: previewHtml }} />
        <p className="text-xs font-semibold text-slate-600 mb-2">기호</p>
        <div className="space-y-1.5 mb-5">
          {SYMBOL_GROUPS.map(([label, symbols]) => <div key={label} className="flex flex-wrap items-center gap-1"><span className="w-14 text-[11px] text-slate-400">{label}</span>{symbols.map(symbol => <button key={symbol} type="button" onClick={() => insertSymbol(symbol)} className="min-w-8 h-8 rounded border border-slate-200 bg-white px-1 text-sm text-slate-700 hover:border-indigo-300 hover:bg-indigo-50">{symbol}</button>)}</div>)}
        </div>
        <div className="flex justify-end gap-2"><button type="button" onClick={onCancel} className="px-3 py-2 text-sm text-slate-500">취소</button><button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">수식 넣기</button></div>
      </form>
    </div>
  )
}
