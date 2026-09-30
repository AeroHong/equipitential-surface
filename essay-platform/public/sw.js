// 앱 설치(PWA) 요건을 채우기 위한 최소 서비스 워커 — fetch 핸들러 없이(네트워크 요청은
// 브라우저가 그대로 처리 — 평가 중 오래된 코드가 남는 일이 없도록). src/main.jsx에서 등록.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
