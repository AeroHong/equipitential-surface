import React, { useMemo } from 'react'
import katex from 'katex'
import { answerToTokens, diffTokens, rangeChanged, tokenRangeOfText, tokensText } from '../../utils/textDiff.js'
import { locateInText } from '../../utils/feedbackAnchors.js'
import { NoteBadge, NoteText, NOTE_STYLES } from './StickyNote.jsx'

const TEXT_KEY = '__text__'

const STATUS = {
  changed: { label: '고침', className: 'bg-green-100 text-green-700' },
  kept: { label: '그대로', className: 'bg-gray-100 text-gray-600' },
  unknown: { label: '비교 불가', className: 'bg-white text-gray-400 border border-gray-200' }
}

/** 노트가 공개 시점 답안의 어느 토큰 범위에 붙었는지 — 못 찾으면 null */
function noteTokenRange(note, base) {
  const anchor = note.anchor
  if (anchor?.type === 'text') {
    const loc = locateInText(tokensText(base.tokens), anchor)
    return loc ? tokenRangeOfText(base.tokens, loc.start, loc.end) : null
  }
  const list = base.elements[anchor?.kind]
  if (!list) return null // 실험 결과 등은 비교하지 않는다
  if (!anchor.key) return list[anchor.index] || null
  let best = null
  list.forEach((el, i) => {
    if (el.key === anchor.key && (!best || Math.abs(i - anchor.index) < Math.abs(best.i - anchor.index))) best = { ...el, i }
  })
  return best
}

function Token({ tok }) {
  if (tok.kind === 'br') return '\n'
  if (tok.kind === 'img') return <img src={tok.src} alt="" className="mx-0.5 inline-block max-h-20 rounded align-middle" />
  if (tok.kind === 'math') {
    return <span dangerouslySetInnerHTML={{ __html: katex.renderToString(tok.latex || '', { throwOnError: false }) }} />
  }
  if (tok.kind === 'table') return <span className="mr-1 rounded bg-gray-100 px-1 text-[11px] text-gray-500">표</span>
  if (tok.kind === 'sep') return <span className="text-gray-300"> | </span>
  return tok.t
}

/**
 * 피드백 반영 확인 — 피드백 공개 시점 답안(baseline)과 지금 답안을 섹션별로 비교한다.
 * 지운 부분은 빨간 취소선, 추가한 부분은 초록. 포스트잇마다 붙은 자리가 바뀌었는지(고침/그대로) 표시.
 *
 * @param {{usesSections:boolean, template:object|null, baseline:{text:string, sections:Object<string,string>},
 *   baselineAt?:Date|null, submission:object, notes:Array<object>}} props
 */
export default function RevisionCompare({ usesSections, template, baseline, baselineAt, submission, notes }) {
  const result = useMemo(() => {
    const secs = usesSections
      ? (template?.sections || []).filter(s => s.type !== 'experiment')
      : [{ id: TEXT_KEY, heading: null }]
    const rows = secs.map(sec => {
      const baseHtml = sec.id === TEXT_KEY ? baseline.text : baseline.sections?.[sec.id]
      const curHtml = sec.id === TEXT_KEY ? submission?.text : submission?.sections?.[sec.id]?.text
      const base = answerToTokens(baseHtml || '')
      const cur = answerToTokens(curHtml || '')
      const diff = diffTokens(base.tokens, cur.tokens)
      const secNotes = notes
        .filter(n => (n.sectionId || TEXT_KEY) === sec.id)
        .map(note => {
          const range = noteTokenRange(note, base)
          return { note, range, status: !range ? 'unknown' : rangeChanged(diff, range.i0, range.i1) ? 'changed' : 'kept' }
        })
        .sort((a, b) => (a.range?.i0 ?? -1) - (b.range?.i0 ?? -1))
      return { sec, base, cur, diff, secNotes }
    })
    // 번호는 화면 순서대로(섹션 → 답안 안 위치)
    let num = 0
    rows.forEach(r => r.secNotes.forEach(x => { x.num = ++num }))
    return rows
  }, [usesSections, template, baseline, submission, notes])

  const allNotes = result.flatMap(r => r.secNotes)
  const changedSecs = result.filter(r => r.diff.changed).length
  const count = s => allNotes.filter(x => x.status === s).length

  function renderDiff({ base, cur, diff, secNotes }) {
    // 노트 번호 배지는 그 노트가 붙은 첫 토큰 앞에
    const badgesAt = {}
    secNotes.forEach(x => { if (x.range) (badgesAt[x.range.i0] ||= []).push(x) })
    const out = []
    diff.ops.forEach((op, k) => {
      if (op.type !== 'ins' && badgesAt[op.a]) {
        badgesAt[op.a].forEach(x => out.push(
          <NoteBadge key={`b${x.note.id}`} num={x.num} color={x.note.color} className="mx-0.5 align-text-top" />
        ))
      }
      if (op.type === 'same') out.push(<Token key={k} tok={base.tokens[op.a]} />)
      else if (op.type === 'del') {
        out.push(<del key={k} className="rounded-sm bg-red-100 text-red-700 decoration-red-500 [&_img]:opacity-40 [&_img]:ring-2 [&_img]:ring-red-400"><Token tok={base.tokens[op.a]} /></del>)
      } else {
        out.push(<ins key={k} className="rounded-sm bg-green-100 text-green-800 no-underline [&_img]:ring-2 [&_img]:ring-green-500"><Token tok={cur.tokens[op.b]} /></ins>)
      }
    })
    return out
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-gray-700">
          피드백 공개{baselineAt ? `(${baselineAt.getMonth() + 1}/${baselineAt.getDate()})` : ''} 이후 수정
        </span>
        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-indigo-700">바뀐 {usesSections ? '문항' : '부분'} {changedSecs}/{result.length}</span>
        {allNotes.length > 0 && (
          <span className="rounded-full bg-green-50 px-2 py-0.5 text-green-700">포스트잇 자리 고침 {count('changed')}/{allNotes.length}</span>
        )}
        <span className="ml-auto flex items-center gap-2 text-gray-500">
          <del className="rounded-sm bg-red-100 px-1 text-red-700">지움</del>
          <ins className="rounded-sm bg-green-100 px-1 text-green-800 no-underline">추가</ins>
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-4">
          {result.map(row => (
            <div key={row.sec.id}>
              {row.sec.heading && <h3 className="mb-1 text-sm font-bold text-gray-800">{row.sec.heading}</h3>}
              {row.diff.changed ? (
                <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-gray-800">{renderDiff(row)}</div>
              ) : (
                <p className="text-sm text-gray-400">변경 없음</p>
              )}
            </div>
          ))}
        </div>

        <div className="space-y-2">
          {allNotes.length === 0 && <p className="text-xs text-gray-400">포스트잇이 없습니다.</p>}
          {allNotes.map(({ note, num, status }) => {
            const quote = note.anchor?.type === 'text' ? note.anchor.quote : null
            return (
              <div key={note.id} className="rounded-md p-2.5 text-xs shadow-sm" style={{ background: (NOTE_STYLES[note.color] || NOTE_STYLES.yellow).paper }}>
                <div className="mb-1 flex items-center gap-1.5">
                  <NoteBadge num={num} color={note.color} />
                  <span className={`ml-auto rounded-full px-2 py-0.5 font-semibold ${STATUS[status].className}`}>{STATUS[status].label}</span>
                </div>
                {quote && <p className="mb-1 line-clamp-2 border-l-2 border-black/15 pl-1.5 text-gray-500">{quote}</p>}
                <p className="whitespace-pre-wrap break-words text-gray-800"><NoteText text={note.text || ''} /></p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
