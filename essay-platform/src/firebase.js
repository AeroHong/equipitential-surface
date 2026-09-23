// physlab과 동일한 Firebase 프로젝트를 공유한다(Firestore의 users 컬렉션, 로그인 계정을 그대로 재사용하기 위함).
import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { getDatabase } from 'firebase/database'

const firebaseConfig = {
  apiKey: "AIzaSyAKp3ooZkJPJE-SZrL6srfmmuWIFafAayY",
  authDomain: "equipotential-surface.firebaseapp.com",
  projectId: "equipotential-surface",
  storageBucket: "equipotential-surface.firebasestorage.app",
  messagingSenderId: "60344638100",
  appId: "1:60344638100:web:ee101c5cf8b67c86d2b281",
  measurementId: "G-PHST60W9XC",
  // Realtime Database — 실시간 접속/입력 현황(presence)용. Firestore와 달리 onDisconnect()가
  // 있어야 "연결이 끊기면 자동으로 오프라인 처리"가 가능해서 이 용도로만 별도로 쓴다.
  // Firebase 콘솔에서 Realtime Database 인스턴스를 만들면 발급되는 주소를 .env.local의
  // VITE_FIREBASE_DATABASE_URL에 넣어야 한다(.env.local.example 참고). 비어있으면 presence
  // 기능은 조용히 꺼진 채로 동작한다(usePresence.js가 db가 없으면 아무것도 하지 않음).
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || undefined
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)
export const googleProvider = new GoogleAuthProvider()
// databaseURL이 아직 설정되지 않은 환경(RTDB 미생성)에서는 getDatabase()가 즉시 던지므로,
// presence 기능이 없어도 앱 전체가 죽지 않도록 감싼다.
export const rtdb = firebaseConfig.databaseURL ? getDatabase(app) : null

export default app
