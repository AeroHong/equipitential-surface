// ============================================================
// Firebase 초기화 파일
//
// ⚠️  사용 방법:
//  1. Firebase 콘솔(https://console.firebase.google.com)에서 프로젝트를 생성합니다.
//  2. 프로젝트 설정 > 일반 > 내 앱 > 웹 앱 추가 후 아래 config 값을 교체하세요.
//  3. Authentication > Sign-in method > Google 사용 설정
//  4. Firestore Database 생성 (프로덕션 모드 권장)
// ============================================================

import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

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
export const googleProvider = new GoogleAuthProvider()

// 배포 시 학교 도메인만 허용하려면 아래 주석 해제
// googleProvider.setCustomParameters({ hd: 'seonyoo.hs.kr' })

export default app
