// smart-teachers-office(apps/dashboard/src/components/richTextStyles.js)에서 이식.
// 원본은 표/날짜칩/캔버스카드/북마크카드/멘션칩/체크리스트/콜아웃/토글까지 담고 있지만,
// 지문 편집에는 필요 없어 제외했다 — SlashMenu.jsx에서도 같은 항목들을 뺐다.
export const RICH_TEXT_SX = {
  '& img': { maxWidth: '100%', borderRadius: 1, my: 0.5 },
  '& ul, & ol': { pl: 3, my: 0.5 },
  '& a': { color: 'primary.main' },
  '& p': { m: 0 },
  '& h2': { fontSize: '1.15rem', fontWeight: 800, m: '0.6em 0 0.2em' },
  '& h3': { fontSize: '1rem', fontWeight: 700, m: '0.5em 0 0.2em' },
  '& h4': { fontSize: '0.92rem', fontWeight: 700, m: '0.45em 0 0.15em' },
  '& blockquote': {
    m: '0.4em 0', pl: 1.5, borderLeft: '3px solid', borderColor: 'divider',
    color: 'text.secondary'
  },
  '& hr': { border: 0, borderTop: '1px solid', borderColor: 'divider', my: 1.5 }
}
