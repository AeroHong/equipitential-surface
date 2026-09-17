import katex from 'katex'

export const MATH_TEMPLATES = [
  { id: 'plain', label: '기본 식', slots: [['main', '식']] },
  { id: 'fraction', label: '분수', slots: [['top', '분자'], ['bottom', '분모']] },
  { id: 'power', label: '제곱·지수', slots: [['base', '밑'], ['exponent', '지수']] },
  { id: 'subscript', label: '아래첨자', slots: [['base', '기호'], ['subscript', '아래첨자']] },
  { id: 'sqrt', label: '제곱근', slots: [['body', '루트 안']] },
  { id: 'brackets', label: '괄호', slots: [['body', '괄호 안']] },
  { id: 'absolute', label: '절댓값', slots: [['body', '절댓값 안']] },
  { id: 'limit', label: '극한', slots: [['variable', '변수'], ['target', '값'], ['body', '식']] },
  { id: 'sum', label: '합', slots: [['lower', '아래'], ['upper', '위'], ['body', '식']] },
  { id: 'integral', label: '적분', slots: [['lower', '아래'], ['upper', '위'], ['body', '식']] },
  { id: 'matrix', label: '행렬', slots: [['cells', '행렬 (예: a,b;c,d)']] }
]

const templateById = Object.fromEntries(MATH_TEMPLATES.map(t => [t.id, t]))

const TEX_SYMBOLS = {
  'α': '\\alpha', 'β': '\\beta', 'γ': '\\gamma', 'θ': '\\theta', 'π': '\\pi', 'Δ': '\\Delta',
  '∞': '\\infty', '≤': '\\le', '≥': '\\ge', '≠': '\\ne', '≈': '\\approx', '∈': '\\in',
  '∉': '\\notin', '⊂': '\\subset', '∪': '\\cup', '∩': '\\cap', '→': '\\to', '±': '\\pm', '×': '\\times'
}

function texValue(value = '') {
  return [...String(value)].map(char => {
    if (TEX_SYMBOLS[char]) return TEX_SYMBOLS[char]
    if (char === '\\') return '\\backslash '
    if (/[{}#$%&_]/.test(char)) return `\\${char}`
    return char
  }).join('')
}

export function createMathExpression(template = 'plain') {
  const selected = templateById[template] || templateById.plain
  return { template: selected.id, values: Object.fromEntries(selected.slots.map(([key]) => [key, ''])) }
}

/** 슬롯 값이 문자열이 아니라 "수식 속 수식"(중첩 식)인지 판별한다. */
export function isNestedExpression(value) {
  return Boolean(value) && typeof value === 'object' && typeof value.template === 'string'
}

export function normalizeMathExpression(expression) {
  const selected = templateById[expression?.template] || templateById.plain
  return {
    template: selected.id,
    values: Object.fromEntries(selected.slots.map(([key]) => {
      const raw = expression?.values?.[key]
      return [key, isNestedExpression(raw) ? normalizeMathExpression(raw) : String(raw || '')]
    }))
  }
}

export function mathToLatex(expression) {
  const { template, values } = normalizeMathExpression(expression)
  // 빈 칸도 KaTeX가 항상 렌더링할 수 있는 작은 사각형으로 보인다. 비어 있는 수식을
  // 잠시 저장해도 리플레이에서 오류 메시지가 노출되지 않는다.
  const v = key => {
    const raw = values[key]
    if (isNestedExpression(raw)) return mathToLatex(raw)
    return texValue(raw) || '\\square'
  }
  switch (template) {
    case 'fraction': return `\\frac{${v('top')}}{${v('bottom')}}`
    case 'power': return `{${v('base')}}^{${v('exponent')}}`
    case 'subscript': return `{${v('base')}}_{${v('subscript')}}`
    case 'sqrt': return `\\sqrt{${v('body')}}`
    case 'brackets': return `\\left(${v('body')}\\right)`
    case 'absolute': return `\\left|${v('body')}\\right|`
    case 'limit': return `\\lim_{${v('variable')}\\to ${v('target')}} ${v('body')}`
    case 'sum': return `\\sum_{${v('lower')}}^{${v('upper')}} ${v('body')}`
    case 'integral': return `\\int_{${v('lower')}}^{${v('upper')}} ${v('body')}\\,dx`
    case 'matrix': {
      const rows = values.cells.split(';').map(row => row.split(',').map(texValue).join(' & ')).filter(Boolean)
      return `\\begin{pmatrix}${rows.join(' \\\\ ')}\\end{pmatrix}`
    }
    default: return v('main')
  }
}

export function mathPlainLabel(expression) {
  const { template, values } = normalizeMathExpression(expression)
  const text = key => {
    const raw = values[key]
    if (isNestedExpression(raw)) return mathPlainLabel(raw)
    return raw || '□'
  }
  switch (template) {
    case 'fraction': return `(${text('top')})/(${text('bottom')})`
    case 'power': return `${text('base')}^${text('exponent')}`
    case 'subscript': return `${text('base')}_${text('subscript')}`
    case 'sqrt': return `√(${text('body')})`
    case 'brackets': return `(${text('body')})`
    case 'absolute': return `|${text('body')}|`
    case 'limit': return `lim ${text('variable')}→${text('target')} ${text('body')}`
    case 'sum': return `Σ(${text('lower')}~${text('upper')}) ${text('body')}`
    case 'integral': return `∫(${text('lower')}~${text('upper')}) ${text('body')} dx`
    case 'matrix': return `[${text('cells')}]`
    default: return text('main')
  }
}

function encode(expression) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(normalizeMathExpression(expression)))))
}

export function decodeMathExpression(encoded) {
  try {
    return normalizeMathExpression(JSON.parse(decodeURIComponent(escape(atob(encoded)))))
  } catch { return createMathExpression() }
}

export function createMathHtml(expression, mode = 'inline') {
  const safeMode = mode === 'block' ? 'block' : 'inline'
  const label = mathPlainLabel(expression)
  return `<span class="student-math student-math--${safeMode}" data-math="${encode(expression)}" data-math-mode="${safeMode}" contenteditable="false" role="math" tabindex="0" aria-label="수식: ${label.replace(/"/g, '')}">${label}</span>`
}

export function prepareMathForStorage(root) {
  root?.querySelectorAll?.('[data-math]').forEach(node => {
    const expression = decodeMathExpression(node.getAttribute('data-math'))
    node.textContent = mathPlainLabel(expression)
  })
}

export function renderMathInElement(root) {
  root?.querySelectorAll?.('[data-math]').forEach(node => {
    const expression = decodeMathExpression(node.getAttribute('data-math'))
    const mode = node.getAttribute('data-math-mode') === 'block' ? 'block' : 'inline'
    node.classList.add('student-math', `student-math--${mode}`)
    node.setAttribute('aria-label', `수식: ${mathPlainLabel(expression)}`)
    katex.render(mathToLatex(expression), node, { throwOnError: false, displayMode: mode === 'block' })
  })
}

/** Chrome이 contenteditable=false 수식 뒤 Enter에서 wrapper를 복제하지 않게 줄바꿈을 직접 만든다. */
export function insertLineBreakAfterMath(root) {
  const selection = window.getSelection()
  if (!root || !selection?.rangeCount) return false
  const range = selection.getRangeAt(0)
  if (!range.collapsed || !root.contains(range.startContainer)) return false

  let previous
  if (range.startContainer.nodeType === Node.TEXT_NODE) {
    if (range.startOffset !== 0) return false
    previous = range.startContainer.previousSibling
  } else {
    previous = range.startContainer.childNodes[range.startOffset - 1]
  }
  if (!(previous instanceof Element) || !previous.matches('[data-math]')) return false

  const breakNode = document.createElement('br')
  // br 다음에 실제 텍스트 노드가 있어야 Chromium이 새 줄에서의 캐럿을 안정적으로 유지한다.
  const caretNode = document.createTextNode('\u200B')
  previous.after(breakNode, caretNode)
  const nextRange = document.createRange()
  nextRange.setStart(caretNode, 1)
  nextRange.collapse(true)
  selection.removeAllRanges()
  selection.addRange(nextRange)
  return true
}
