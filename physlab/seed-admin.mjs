import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

// Application Default Credentials (gcloud SDK 로그인 사용)
initializeApp({ projectId: 'equipotential-surface' })

const db = getFirestore()

const uid  = '7EspfHdAjzSBa4xXtBfCONc493U2'
const data = {
  uid,
  email: 'hckgood@gmail.com',
  name:  '홍창기',
  role:  'super_admin',
  class: '',
  updatedAt: new Date(),
}

await db.collection('users').doc(uid).set(data, { merge: true })
console.log('✅ super_admin 등록 완료:', uid)
process.exit(0)
