// AI 특유 표현 / 마크다운 잔재 탐지 — 단독 판정이 아닌 교사용 보조 신호

const AI_PHRASES = [
  '다음은', '결론적으로', '요약하자면', '요약하면', '전반적으로',
  '다음과 같습니다', '물론입니다', '중요한 것은', '핵심은', '종합적으로'
]

const MARKDOWN_PATTERNS = [
  /\*\*[^*]+\*\*/,   // **강조**
  /^#{1,6}\s/m,      // # 제목
  /^[-*]\s/m,        // - 목록
  /`[^`]+`/,         // `코드`
]

/**
 * 텍스트에서 AI 특유 표현/마크다운 잔재를 스캔
 * @param {string} text
 * @returns {{phraseMatches: string[], markdownHits: boolean, score: number}}
 */
export function scanText(text) {
  const body = text || ''
  const phraseMatches = AI_PHRASES.filter(p => body.includes(p))
  const markdownHits = MARKDOWN_PATTERNS.some(re => re.test(body))
  const score = phraseMatches.length * 2 + (markdownHits ? 2 : 0)
  return { phraseMatches, markdownHits, score }
}
