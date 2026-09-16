// smart-teachers-office(apps/dashboard/src/components/SlashMenu.jsx)에서 이식.
// 콜아웃/토글 항목은 뺐다 — Cloud Functions/Firestore 서브컬렉션 등 이 프로덕트 전용
// 기능에 기대지 않는, 지문 편집에 실제로 쓰이는 블록만 남겼다.
import { useEffect, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import TitleIcon from '@mui/icons-material/Title'
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted'
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered'
import FormatQuoteIcon from '@mui/icons-material/FormatQuote'
import HorizontalRuleIcon from '@mui/icons-material/HorizontalRule'
import ImageIcon from '@mui/icons-material/Image'

const MENU_WIDTH = 268
const MENU_MAX_HEIGHT = 300

export const SLASH_ITEMS = [
  { id: 'h1', label: '큰 제목', hint: '문단을 나누는 제목', keywords: 'ㅈㅁ 제목 큰제목 h1 title', Icon: TitleIcon, block: 'H2' },
  { id: 'h2', label: '중간 제목', hint: '중간 소제목', keywords: 'ㅈㄱㅈㅁ 제목 중간제목 h2 subtitle', Icon: TitleIcon, block: 'H3' },
  { id: 'h3', label: '작은 제목', hint: '작은 소제목', keywords: 'ㅈㅇㅈㅁ 제목 작은제목 h3 subtitle', Icon: TitleIcon, block: 'H4' },
  { id: 'ul', label: '글머리 기호', hint: '· 목록', keywords: 'ㄱㅁㄹ 글머리 목록 bullet list', Icon: FormatListBulletedIcon, cmd: 'insertUnorderedList' },
  { id: 'ol', label: '번호 매기기', hint: '1. 2. 3. 목록', keywords: 'ㅂㅎ 번호 순서 number ordered list', Icon: FormatListNumberedIcon, cmd: 'insertOrderedList' },
  { id: 'quote', label: '인용', hint: '들여쓴 인용문', keywords: 'ㅇㅇ 인용 quote', Icon: FormatQuoteIcon, block: 'BLOCKQUOTE' },
  { id: 'hr', label: '구분선', hint: '가로 줄로 나누기', keywords: 'ㄱㅂㅅ 구분선 divider hr line', Icon: HorizontalRuleIcon, html: '<hr/><p><br></p>' },
  { id: 'image', label: '이미지', hint: '파일에서 고르기', keywords: 'ㅇㅁㅈ 이미지 사진 그림 image photo', Icon: ImageIcon, action: 'image' }
]

export default function SlashMenu({ open, anchorRect, query, onSelect, onClose, extraItems = [] }) {
  const [cursor, setCursor] = useState(0)
  const listRef = useRef(null)

  const items = useMemo(() => {
    const all = extraItems.length ? [...SLASH_ITEMS, ...extraItems] : SLASH_ITEMS
    const q = (query || '').trim().toLowerCase()
    if (!q) return all
    return all.filter(i =>
      i.label.toLowerCase().includes(q) || i.keywords.toLowerCase().includes(q))
  }, [query, extraItems])

  useEffect(() => { setCursor(0) }, [query])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.isComposing || e.keyCode === 229) return
      if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, items.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)) }
      else if (e.key === 'Enter' || e.key === 'Tab') {
        if (items[cursor]) { e.preventDefault(); onSelect(items[cursor]) }
      } else if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, items, cursor, onSelect, onClose])

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  if (!open || !anchorRect || items.length === 0) return null

  const spaceBelow = window.innerHeight - anchorRect.bottom
  const above = spaceBelow < MENU_MAX_HEIGHT + 24
  const top = above ? anchorRect.top - Math.min(MENU_MAX_HEIGHT, items.length * 46 + 16) - 6 : anchorRect.bottom + 6
  const left = Math.min(anchorRect.left, window.innerWidth - MENU_WIDTH - 16)

  return (
    <Paper
      elevation={8}
      ref={listRef}
      sx={{
        position: 'fixed', top, left, width: MENU_WIDTH, zIndex: 1400,
        maxHeight: MENU_MAX_HEIGHT, overflowY: 'auto', py: 0.5,
        border: '1px solid', borderColor: 'divider'
      }}
    >
      {items.map((item, i) => (
        <Box
          key={item.id}
          data-active={i === cursor}
          onMouseDown={e => { e.preventDefault(); onSelect(item) }}
          onMouseEnter={() => setCursor(i)}
          sx={{
            display: 'flex', alignItems: 'center', gap: 1.2,
            px: 1.2, py: 0.7, cursor: 'pointer',
            bgcolor: i === cursor ? 'action.hover' : 'transparent'
          }}
        >
          <item.Icon sx={{ fontSize: 18, color: 'text.secondary', flexShrink: 0 }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography fontSize="0.85rem" fontWeight={600} noWrap>{item.label}</Typography>
            <Typography fontSize="0.73rem" color="text.secondary" noWrap>{item.hint}</Typography>
          </Box>
        </Box>
      ))}
    </Paper>
  )
}
