import React, { useState } from 'react'
import { formatFitValue } from '../services/experiments.js'

/**
 * 실험 결과 한 건의 본문 — 보고서 PNG, 회귀값, 측정 데이터표.
 * 학생 작성 화면의 실험 카드, 교사 대시보드 모달, 리플레이 화면이 같은 모양으로 보여준다.
 * @param {{result: object, showTable?: boolean}} props
 */
export default function ExperimentResultView({ result, showTable = false }) {
  const [tableOpen, setTableOpen] = useState(showTable)
  if (!result) return null
  const unit = result.unit || 'cm'
  const fit = result.fit
  const points = result.points || []
  const updated = result.updatedAt?.toDate?.()

  return (
    <div className="space-y-3">
      {result.pngUrl && (
        <a href={result.pngUrl} target="_blank" rel="noopener noreferrer" className="block">
          <img
            src={result.pngUrl}
            alt="실험 분석 보고서"
            className="w-full rounded-lg border border-gray-200 bg-white"
            loading="lazy"
          />
        </a>
      )}

      <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <Stat label="측정 점" value={`${points.length}개`} />
        <Stat label={`vx (${unit}/s)`} value={formatFitValue(fit?.vx, 2)} sub={fit?.vxR2 != null ? `R² ${formatFitValue(fit.vxR2, 3)}` : null} />
        <Stat label={`가속도 a (${unit}/s²)`} value={formatFitValue(fit?.ay, 1)} sub={fit?.ayR2 != null ? `R² ${formatFitValue(fit.ayR2, 3)}` : null} />
        <Stat label="보정" value={result.calib ? `${formatFitValue(result.calib.realLengthCm, 1)}cm` : '없음'} sub={result.fps ? `${result.fps}fps` : null} />
      </dl>
      {!fit && <p className="text-xs text-amber-600">점이 4개 미만이라 회귀 분석값이 없습니다.</p>}
      {!result.calib && <p className="text-xs text-amber-600">기준 보정 없이 px 단위로 측정했습니다.</p>}

      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>
          {updated ? `${updated.toLocaleString('ko-KR')} 제출` : ''}
          {result.attemptCount > 1 ? ` · ${result.attemptCount}회째` : ''}
        </span>
        {points.length > 0 && (
          <button type="button" onClick={() => setTableOpen(o => !o)} className="text-indigo-600 hover:underline">
            {tableOpen ? '데이터표 접기' : '데이터표 보기'}
          </button>
        )}
      </div>

      {tableOpen && points.length > 0 && (
        <div className="max-h-64 overflow-auto rounded-lg border border-gray-200">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-50 text-gray-500">
              <tr>
                <th className="px-2 py-1.5 text-left">#</th>
                <th className="px-2 py-1.5 text-right">t (s)</th>
                <th className="px-2 py-1.5 text-right">x ({unit})</th>
                <th className="px-2 py-1.5 text-right">Δx</th>
                <th className="px-2 py-1.5 text-right">y ({unit})</th>
                <th className="px-2 py-1.5 text-right">Δy</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p, i) => {
                const prev = points[i - 1]
                return (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-2 py-1 text-gray-400">{i + 1}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{formatFitValue(p.t, 3)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{formatFitValue(p.x, 2)}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-gray-500">{prev ? formatFitValue(p.x - prev.x, 2) : '-'}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{formatFitValue(p.y, 2)}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-gray-500">{prev ? formatFitValue(p.y - prev.y, 2) : '-'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, sub }) {
  return (
    <div className="rounded-lg bg-gray-50 px-2.5 py-2">
      <dt className="text-gray-400">{label}</dt>
      <dd className="text-sm font-bold text-gray-800 tabular-nums">{value}</dd>
      {sub && <dd className="text-gray-400 tabular-nums">{sub}</dd>}
    </div>
  )
}
