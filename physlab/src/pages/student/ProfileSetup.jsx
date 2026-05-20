import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../App.jsx'
import { updateUser } from '../../services/firebase.js'

const CLASS_OPTIONS = [
  '1-1', '1-2', '1-3', '1-4', '1-5',
  '2-1', '2-2', '2-3', '2-4', '2-5',
  '3-1', '3-2', '3-3', '3-4', '3-5',
]

export default function ProfileSetup() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [classValue, setClassValue] = useState('')
  const [studentId, setStudentId] = useState('')
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})

  function validate() {
    const e = {}
    if (!name.trim()) e.name = '이름을 입력해주세요.'
    if (!classValue) e.classValue = '학반을 선택해주세요.'
    if (!studentId.trim()) e.studentId = '학번을 입력해주세요.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSave() {
    if (!validate()) return
    if (!user) return
    setSaving(true)
    try {
      await updateUser(user.uid, {
        name: name.trim(),
        class: classValue,
        studentId: studentId.trim(),
        role: 'student',
      })
      navigate('/student')
    } catch (err) {
      console.error('프로필 저장 실패:', err)
      alert('저장 중 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* 로고 */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-white text-2xl font-black">PL</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900">PhysLab</h1>
          <p className="text-sm text-gray-500 mt-1">등전위면 실험</p>
        </div>

        {/* 카드 */}
        <div className="bg-white rounded-3xl shadow-xl p-8">
          {/* 안내 문구 */}
          <div className="bg-blue-50 border border-blue-100 rounded-2xl px-5 py-4 mb-6">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-blue-800">PhysLab에 처음 오셨군요!</p>
                <p className="text-xs text-blue-600 mt-0.5 leading-relaxed">
                  실험 기록 관리를 위해 학생 정보를 입력해주세요.<br />
                  한 번만 입력하면 됩니다.
                </p>
              </div>
            </div>
          </div>

          <h2 className="text-lg font-bold text-gray-900 mb-5">학생 정보 입력</h2>

          <div className="space-y-4">
            {/* 이름 */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                이름 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={e => { setName(e.target.value); setErrors(prev => ({ ...prev, name: undefined })) }}
                placeholder="홍길동"
                className={[
                  'w-full px-4 py-3 rounded-xl border text-sm transition-colors outline-none',
                  errors.name
                    ? 'border-red-300 bg-red-50 focus:border-red-400 focus:ring-2 focus:ring-red-100'
                    : 'border-gray-200 bg-gray-50 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100'
                ].join(' ')}
              />
              {errors.name && (
                <p className="text-xs text-red-500 mt-1">{errors.name}</p>
              )}
            </div>

            {/* 학반 */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                학반 <span className="text-red-500">*</span>
              </label>
              <select
                value={classValue}
                onChange={e => { setClassValue(e.target.value); setErrors(prev => ({ ...prev, classValue: undefined })) }}
                className={[
                  'w-full px-4 py-3 rounded-xl border text-sm transition-colors outline-none appearance-none bg-no-repeat',
                  errors.classValue
                    ? 'border-red-300 bg-red-50 focus:border-red-400 focus:ring-2 focus:ring-red-100'
                    : 'border-gray-200 bg-gray-50 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100'
                ].join(' ')}
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239ca3af'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundPosition: 'right 12px center', backgroundSize: '16px' }}
              >
                <option value="">학반 선택</option>
                {CLASS_OPTIONS.map(c => (
                  <option key={c} value={c}>{c}반</option>
                ))}
              </select>
              {errors.classValue && (
                <p className="text-xs text-red-500 mt-1">{errors.classValue}</p>
              )}
            </div>

            {/* 학번 */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                학번 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={studentId}
                onChange={e => { setStudentId(e.target.value); setErrors(prev => ({ ...prev, studentId: undefined })) }}
                placeholder="예: 30218"
                className={[
                  'w-full px-4 py-3 rounded-xl border text-sm transition-colors outline-none',
                  errors.studentId
                    ? 'border-red-300 bg-red-50 focus:border-red-400 focus:ring-2 focus:ring-red-100'
                    : 'border-gray-200 bg-gray-50 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100'
                ].join(' ')}
              />
              {errors.studentId && (
                <p className="text-xs text-red-500 mt-1">{errors.studentId}</p>
              )}
            </div>
          </div>

          {/* 저장 버튼 */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full mt-6 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                저장 중...
              </span>
            ) : (
              '저장하고 시작하기'
            )}
          </button>

          <p className="text-xs text-gray-400 text-center mt-4">
            입력한 정보는 실험 결과 관리에만 사용됩니다.
          </p>
        </div>
      </div>
    </div>
  )
}
