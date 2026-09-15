// physlab과 동일한 Firebase 프로젝트를 공유한다(Firestore의 users 컬렉션, 로그인 계정을 그대로 재사용하기 위함).
import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: "AIzaSyAKp3ooZkJPJE-SZrL6srfmmuWIFafAayY",
  authDomain: "equipotential-surface.firebaseapp.com",
  projectId: "equipotential-surface",
  storageBucket: "equipotential-surface.firebasestorage.app",
  messagingSenderId: "60344638100",
  appId: "1:60344638100:web:ee101c5cf8b67c86d2b281",
  measurementId: "G-PHST60W9XC"
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)
export const googleProvider = new GoogleAuthProvider()

export default app
