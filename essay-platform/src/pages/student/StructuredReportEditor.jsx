import React from 'react'
import EssayEditor from '../../components/EssayEditor.jsx'
import { htmlToPlainText } from '../../utils/richText.js'

function scrollToSection(id) {
  document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/**
 * 구조화된 응답(보고서 양식) 편집기. 템플릿(reportTemplates)의 섹션 순서대로 입력란을
 * 나열하고, 상단 칩으로 어떤 항목을 아직 안 썼는지 한눈에 보여준다(요청 배경: 제목을
 * 놓치지 않고 다 채우게 하는 것). 입력 위젯 자체는 자유서술과 같은 EssayEditor를 섹션마다
 * 하나씩 재사용한다 — 붙여넣기/타이핑 로깅도 그대로 따라오고, sectionId만 얹어 보낸다.
 */
export default function StructuredReportEditor({ template, sections, onChange, disabled, logInput, logKeydown, logPaste }) {
  if (!template) return null

  function updateSection(id, patch) {
    const current = sections[id] || { text: '', charCount: 0 }
    onChange({ ...sections, [id]: { ...current, ...patch } })
  }

  let lastGroup = null

  return (
    // flex-shrink-0: 지문이 있는 배정에서는 오른쪽 작성 칸(overflow-y-auto)의 flex 자식이다 —
    // EssayEditor.jsx와 같은 이유로, flexbox가 이 영역을 찌그러뜨리지 않고 실제 콘텐츠
    // 높이 그대로 렌더링한 뒤 넘치는 부분은 부모 칸 스크롤로 해결하게 한다.
    <div className="flex-shrink-0">
      {template.description && (
        <p className="text-sm text-gray-500 mb-4 whitespace-pre-wrap">{template.description}</p>
      )}

      {/* 진행 상황 칩 — 초록(작성됨)/회색(미작성), 클릭하면 그 섹션으로 스크롤 */}
      <div className="flex flex-wrap gap-1.5 mb-5 sticky top-0 bg-gray-50 py-2 z-10 -mx-1 px-1">
        {template.sections.map(sec => {
          const filled = htmlToPlainText(sections[sec.id]?.text || '').trim().length > 0
          return (
            <button
              key={sec.id}
              onClick={() => scrollToSection(sec.id)}
              className={`text-xs rounded-full px-2.5 py-1 border font-medium transition-colors whitespace-nowrap ${
                filled ? 'bg-green-100 text-green-700 border-green-200' : 'bg-white text-gray-400 border-gray-200'
              }`}
            >
              {filled ? '✓' : '○'} {sec.heading || sec.groupLabel || '섹션'}
            </button>
          )
        })}
      </div>

      <div className="space-y-6">
        {template.sections.map(sec => {
          const showGroupHeader = sec.groupLabel && sec.groupLabel !== lastGroup
          lastGroup = sec.groupLabel
          const answer = sections[sec.id] || { text: '' }

          return (
            <React.Fragment key={sec.id}>
              {showGroupHeader && (
                <h2 className="text-sm font-bold text-indigo-700 border-b border-indigo-100 pb-1.5 pt-1">
                  {sec.groupLabel}
                </h2>
              )}
              <div id={`section-${sec.id}`} className="scroll-mt-24">
                {sec.heading && (
                  <label className="block text-sm font-bold text-gray-800 mb-1">
                    {sec.heading}
                    {sec.required && <span className="text-red-500 ml-0.5">*</span>}
                  </label>
                )}
                {sec.guidance && (
                  <p className="text-xs text-gray-400 mb-2 whitespace-pre-wrap">{sec.guidance}</p>
                )}
                <div className="min-h-[180px]">
                  <EssayEditor
                    value={answer.text || ''}
                    onChange={html => updateSection(sec.id, { text: html, charCount: htmlToPlainText(html).length })}
                    disabled={disabled}
                    wordLimitGuide={sec.wordLimitGuide || null}
                    onLogInput={entry => logInput?.({ ...entry, sectionId: sec.id })}
                    onLogKeydown={k => logKeydown?.(k, sec.id)}
                    onLogPaste={entry => logPaste?.({ ...entry, sectionId: sec.id })}
                    placeholder="여기에 작성하세요…"
                  />
                </div>
              </div>
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}
