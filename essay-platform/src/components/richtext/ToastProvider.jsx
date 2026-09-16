// smart-teachers-office(apps/dashboard/src/components/ToastProvider.jsx)에서 그대로 이식.
// 이미지 업로드 실패 등을 조용히 console.error로만 묻지 않고 화면에 알린다.
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'

const ToastContext = createContext(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  // Provider 밖에서 호출해도 깨지지 않게 무동작 객체를 돌려준다
  return ctx || NOOP_TOAST
}

const NOOP_TOAST = { error: () => {}, success: () => {} }

export default function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)

  const show = useCallback((severity, message, cause) => {
    if (cause) console.error(message, cause)
    setToast({ severity, message })
  }, [])

  const api = useMemo(() => ({
    error: (message, cause) => show('error', message, cause),
    success: (message) => show('success', message)
  }), [show])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <Snackbar
        open={!!toast}
        autoHideDuration={toast?.severity === 'error' ? 8000 : 3000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={toast?.severity || 'info'}
          variant="filled"
          onClose={() => setToast(null)}
          sx={{ borderRadius: 1 }}
        >
          {toast?.message}
        </Alert>
      </Snackbar>
    </ToastContext.Provider>
  )
}
