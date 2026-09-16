// smart-teachers-office(apps/shared/theme.js)에서 그대로 이식한 MUI 테마.
// 지문 수정 페이지의 리치 에디터 영역에서만 <ThemeProvider>로 감싸 쓰고,
// 나머지 essay-platform 페이지는 계속 Tailwind를 쓴다(앱 전역에는 적용하지 않음).
import { createTheme } from '@mui/material/styles'

export const theme = createTheme({
  palette: {
    primary: {
      main: '#3d5872',
      light: '#6a83a0',
      dark: '#28394a',
      contrastText: '#ffffff'
    },
    secondary: { main: '#06b6d4' },
    background: {
      default: '#f1f3f6',
      paper: '#ffffff'
    },
    divider: '#e8eaed',
    success: { main: '#2e7d32' },
    warning: { main: '#f57c00' },
    error: { main: '#d32f2f' }
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: '"Noto Sans KR", Roboto, sans-serif',
    h5: { fontWeight: 700 },
    h6: { fontWeight: 700 },
    subtitle1: { fontWeight: 600 }
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 6, textTransform: 'none', fontWeight: 600 }
      }
    },
    MuiChip: {
      styleOverrides: { root: { borderRadius: 5, fontWeight: 600 } }
    },
    MuiTextField: {
      defaultProps: { variant: 'outlined', size: 'small' }
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: { borderRadius: 10 } }
    }
  }
})
