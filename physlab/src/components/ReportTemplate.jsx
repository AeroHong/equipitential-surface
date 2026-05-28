import React from 'react'
import EquipotentialMap from './EquipotentialMap.jsx'
import FieldLineCanvas from './FieldLineCanvas.jsx'

const EXP_LABELS = {
  point_electrode: '실험 1 — 점전극 (두 점전하에 의한 전기장)',
  line_electrode:  '실험 2 — 선전극 (평행 선전하에 의한 전기장)',
}

const style = {
  wrap: {
    width: 794,
    background: '#fff',
    fontFamily: '"Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
    color: '#111',
    padding: '32px 40px',
    boxSizing: 'border-box',
  },
  h1: { fontSize: 22, fontWeight: 700, marginBottom: 4, color: '#1e3a8a' },
  subtitle: { fontSize: 13, color: '#6b7280', marginBottom: 24 },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 14, fontWeight: 700, borderBottom: '2px solid #3b82f6',
    paddingBottom: 4, marginBottom: 12, color: '#1d4ed8',
  },
  expTitle: {
    fontSize: 13, fontWeight: 700, color: '#374151',
    background: '#f0f9ff', borderLeft: '4px solid #3b82f6',
    padding: '6px 10px', marginBottom: 10, borderRadius: '0 4px 4px 0',
  },
  infoLabel: { fontSize: 12, color: '#6b7280', width: 60 },
  infoValue: { fontSize: 13, fontWeight: 600 },
  mapRow: { display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' },
  qBlock: { marginBottom: 16 },
  qText: { fontSize: 12, color: '#374151', fontWeight: 600, marginBottom: 4 },
  aText: {
    fontSize: 12, color: '#111827', background: '#f9fafb',
    border: '1px solid #e5e7eb', borderRadius: 6,
    padding: '8px 10px', minHeight: 48, whiteSpace: 'pre-wrap',
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 11 },
  th: {
    background: '#eff6ff', padding: '4px 8px',
    borderBottom: '1px solid #bfdbfe', textAlign: 'center',
  },
  td: { padding: '3px 8px', borderBottom: '1px solid #f3f4f6', textAlign: 'center' },
  footer: { fontSize: 10, color: '#9ca3af', textAlign: 'center', marginTop: 32 },
}

function MeasurementTable({ measurements }) {
  const sorted = [...measurements].sort((a, b) => a.y - b.y || a.x - b.x)
  return (
    <table style={style.table}>
      <thead>
        <tr>
          {['x', 'y', 'V (V)', 'x', 'y', 'V (V)', 'x', 'y', 'V (V)', 'x', 'y', 'V (V)'].map((h, i) => (
            <th key={i} style={style.th}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {chunkArray(sorted, 4).map((row, ri) => (
          <tr key={ri}>
            {row.map((m, ci) => (
              <React.Fragment key={ci}>
                <td style={style.td}>{m.x}</td>
                <td style={style.td}>{m.y}</td>
                <td style={{ ...style.td, fontWeight: 600, color: '#1d4ed8' }}>{Number(m.V).toFixed(2)}</td>
              </React.Fragment>
            ))}
            {Array.from({ length: 4 - row.length }, (_, i) => (
              <React.Fragment key={`e-${i}`}>
                <td style={style.td}></td><td style={style.td}></td><td style={style.td}></td>
              </React.Fragment>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ExperimentSection({ session }) {
  if (!session) return null
  const measurements = session.measurements || []
  const expLabel = EXP_LABELS[session.experimentType] || session.experimentType

  return (
    <div style={style.section}>
      <div style={style.sectionTitle}>측정 결과 — {expLabel}</div>
      <div style={style.mapRow}>
        <div>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>등전위선 지도</div>
          <EquipotentialMap
            measurements={measurements}
            electrodeConfig={session.electrodeConfig}
            width={300}
            height={250}
            levels={16}
          />
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>전기력선 (자동 생성)</div>
          <FieldLineCanvas
            measurements={measurements}
            drawnLines={session.drawnLines_deserialized || []}
            electrodeConfig={session.electrodeConfig}
            width={250}
            height={250}
            readOnly
          />
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
          측정 데이터 ({measurements.length} / 64 포인트)
        </div>
        <MeasurementTable measurements={measurements} />
      </div>
    </div>
  )
}

/**
 * PDF 보고서 레이아웃.
 * session1: 점전극 세션, session2: 선전극 세션 (각각 optional)
 */
export default function ReportTemplate({ student, session1, session2, questions, answers }) {
  const date = new Date().toLocaleDateString('ko-KR')

  return (
    <div style={style.wrap}>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={style.h1}>PhysLab 실험 보고서</div>
          <div style={style.subtitle}>등전위면 측정 실험</div>
        </div>
        <div style={{ fontSize: 12, color: '#6b7280', textAlign: 'right' }}>
          <div>{date}</div>
          <div style={{ marginTop: 2 }}>등전위면 측정 실험</div>
        </div>
      </div>

      {/* 학생 정보 */}
      <div style={style.section}>
        <div style={style.sectionTitle}>학생 정보</div>
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={style.infoLabel}>이름</span>
            <span style={style.infoValue}>{student?.name || '—'}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={style.infoLabel}>학반</span>
            <span style={style.infoValue}>{student?.class ? `${student.class}반` : '—'}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={style.infoLabel}>학번</span>
            <span style={style.infoValue}>{student?.studentId || '—'}</span>
          </div>
        </div>
      </div>

      {/* 실험 1 결과 */}
      <ExperimentSection session={session1} />

      {/* 실험 2 결과 */}
      <ExperimentSection session={session2} />

      {/* 토론 답변 */}
      {questions?.length > 0 && (
        <div style={style.section}>
          <div style={style.sectionTitle}>토론 답변</div>
          {questions.map((q, idx) => (
            <div key={q.id} style={style.qBlock}>
              <div style={style.qText}>Q{idx + 1}. {q.text}</div>
              <div style={style.aText}>
                {answers?.[q.id]?.trim() || '(미작성)'}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={style.footer}>
        PhysLab — 등전위면 측정 실험 시스템 · 생성일: {new Date().toLocaleString('ko-KR')}
      </div>
    </div>
  )
}

function chunkArray(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}
