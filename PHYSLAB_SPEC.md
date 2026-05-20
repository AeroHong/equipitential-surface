# PhysLab — 개발 스펙 최종 확정

> 고등학교 물리 등전위면 실험 웹 플랫폼  
> 작성일: 2026년 5월 | 선유고등학교 교무부

---

## 1. 프로젝트 개요

### 목적
- 고등학교 물리 수업에서 등전위면 실험을 웹 기반으로 진행
- 멀티미터로 측정한 전위값을 태블릿에 수동 입력
- 실시간 등전위선 + 전기력선 + 3D 전위 지형도 시각화
- 학생이 직접 전기력선을 그리고 AI 정답과 비교

### 대상
- 고등학교 3학년 물리학 수업
- 태블릿(안드로이드) + 크롬북 환경
- 팀 구성: 3~4명, 개별 구글 계정 로그인

---

## 2. 실험 설계

### 격자
- **8×8 격자** (64포인트)
- 전도지에 격자선 인쇄 (좌표 표시)
- 측정 단위: V (볼트)

### 전극 배치
- 전극은 **격자 외부**에 위치 (격자 내부는 순수 측정 영역)
- **실험 1**: 점전극(핀) — 격자 좌상단 외부(+) / 우하단 외부(-) 대각선 배치
- **실험 2**: 선전극(막대) — 격자 상단 외부(+) / 하단 외부(-) 평행 배치

```
실험 1 (점전극)        실험 2 (선전극)

(+)●                   ━━━━━━━━ (+)
  ┌──────────┐         ┌──────────┐
  │ · · · ·  │         │ · · · ·  │
  │ · · · ·  │         │ · · · ·  │
  │ · · · ·  │         │ · · · ·  │
  │ · · · ·  │         │ · · · ·  │
  └──────────┘         └──────────┘
            ●(-)        ━━━━━━━━ (-)
```

### 데이터 입력 방식
- 멀티미터로 전위 측정 → 태블릿 터치로 수동 입력
- **하드웨어 자동 측정 없음** (Pico W는 내년 Phase 2)
- 팀원이 격자를 나눠서 동시 측정 가능

---

## 3. 앱 스텝 구조

### Step 1 — 데이터 입력
- 8×8 격자 UI 표시
- 셀 터치 → 전위값 입력 팝업 → 확인
- 입력된 셀 색상 변경 (진행 상황 시각화)
- **실시간 등전위선 렌더링** (D3.js, 입력할수록 업데이트)
- 64개 전체 입력 완료 시 다음 단계 활성화

```
┌─────────────────────────────────────┐
│  8×8 격자           등전위선 미리보기 │
│  ┌──┬──┬──┐        (실시간 업데이트) │
│  │  │▓▓│  │                         │
│  ├──┼──┼──┤                         │
│  │  │  │▓▓│                         │
│  └──┴──┴──┘                         │
│                                     │
│  (3,5) 입력: [ 2.73 ] V  [확인]     │
│  진행: 32 / 64                      │
└─────────────────────────────────────┘
```

### Step 2 — 전기력선 그리기
- 완성된 등전위선 위에 학생이 손가락/펜으로 전기력선 직접 드로잉
- Canvas API 기반 자유 드로잉
- **제출 버튼** → AI가 계산한 정답 전기력선 오버레이
- 학생 그림(파랑) + AI 정답(빨강) 비교 표시
- 수직도 점수 자동 계산 (등전위선과 이루는 각도)

### Step 3 — 3D 전위 지형도
- Plotly.js surface chart
- Z축 = 전위값, 컬러맵 (고전압=빨강, 저전압=파랑)
- 인터랙티브 회전 / 확대 / 축소
- **실험 1 vs 실험 2 나란히 비교** (2회차 완료 후)

---

## 4. 사용자 및 인증

### 인증
- Firebase Auth + Google OAuth
- **학교 구글 계정**으로 로그인 (`@seonyoo.hs.kr`)
- 이메일 도메인으로 역할 자동 판별

### 역할

| 역할 | 권한 |
|------|------|
| `super_admin` | 전체 학생 세션 열람, 실험 설정, 관리 콘솔 |
| `student` | 본인 세션만 접근, 실험 진행, 결과 확인 |

### 관리 콘솔 (Super Admin)
- 학생 목록 + 진행 단계 실시간 모니터링
- 학생 이름 클릭 → 해당 학생 실험 페이지 직접 열람
- 실험 설정 (격자 크기, 전극 위치 등)

---

## 5. 데이터 구조 (Firestore)

```
/users/{uid}
  role: 'super_admin' | 'student'
  name: string
  email: string
  class: string          // 예: '3-2'

/sessions/{sessionId}    // 실험 세션 (실험1 or 실험2)
  studentUid: string
  experimentType: 'point_electrode' | 'line_electrode'
  electrodeConfig: {
    positive: { x, y }   // 격자 외부 좌표
    negative: { x, y }
  }
  measurements: [        // 64개 측정값
    { x: number, y: number, V: number },
    ...
  ]
  drawnLines: []         // 학생이 그린 전기력선 좌표
  score: number | null   // 전기력선 수직도 점수
  step: 1 | 2 | 3        // 현재 진행 단계
  createdAt: timestamp
  updatedAt: timestamp
```

---

## 6. 기술 스택

| 영역 | 기술 | 비고 |
|------|------|------|
| Frontend | React + Tailwind CSS | PWA (태블릿/크롬북) |
| 2D 시각화 | D3.js | 등전위선 contour, 전기력선 |
| 3D 시각화 | Plotly.js | surface chart |
| 드로잉 | Canvas API | 학생 전기력선 입력 |
| 보간 | IDW (Inverse Distance Weighting) | 측정값 → 등고선 |
| 인증 | Firebase Auth (Google OAuth) | 학교 구글 계정 |
| DB | Firebase Firestore | 실시간 동기화 |
| 배포 | Firebase Hosting | HTTPS, PWA |

---

## 7. Google Classroom 연동

- **앱 링크를 Classroom 과제로 공유** → 학생 접근
- **개별 평가 플랫폼**으로 활용 (구글 폼 or 과제)
- 그 이상의 API 연동 없음 (성적 반영 등 불필요)

---

## 8. 수업 흐름

```
[Classroom] 교사가 앱 링크 과제 등록
      ↓
[학생] 링크 클릭 → 구글 계정 로그인 → 실험 앱 진입
      ↓
[팀 활동 - 1차시]
  멀티미터로 측정 → 태블릿 수동 입력
  실시간 등전위선 확인
  전기력선 직접 드로잉 → AI 비교
  3D 지형도 확인
  실험 1 완료 → 전극 교체 → 실험 2 진행
  팀 토론 및 분석
      ↓
[Firestore] 결과 자동 저장
      ↓
[관리 콘솔] 교사 실시간 열람
      ↓
[개별 평가 - 별도 시간]
  Classroom 구글 폼으로 개념 질문 답변
```

---

## 9. 개발 단계

### Phase 1 — 현재 (올해)
- [ ] Firebase 프로젝트 설정 (Auth, Firestore, Hosting)
- [ ] 구글 로그인 + 역할 분리 (Admin / Student)
- [ ] 8×8 격자 수동 입력 UI
- [ ] D3.js 실시간 등전위선 렌더링
- [ ] Canvas 전기력선 드로잉 + AI 비교
- [ ] Plotly.js 3D 전위 지형도
- [ ] 실험 1 vs 2 비교 뷰
- [ ] Admin 관리 콘솔
- [ ] PWA 설정 (태블릿 최적화)
- [ ] Firebase Hosting 배포

### Phase 2 — 내년
- [ ] Raspberry Pi Pico W + ADS1115 연동
- [ ] WebSocket 자동 측정 → 앱 수신
- [ ] 수동/자동 입력 전환 UI

---

## 10. 폴더 구조 (권장)

```
physlab/
├── src/
│   ├── pages/
│   │   ├── admin/
│   │   │   ├── Dashboard.jsx      // 학생 현황 모니터링
│   │   │   └── StudentView.jsx    // 학생 세션 열람
│   │   └── student/
│   │       ├── Step1Input.jsx     // 격자 데이터 입력
│   │       ├── Step2Drawing.jsx   // 전기력선 드로잉
│   │       └── Step3Result.jsx    // 3D 결과 확인
│   ├── components/
│   │   ├── Grid8x8.jsx            // 8×8 격자 UI
│   │   ├── EquipotentialMap.jsx   // D3 등전위선
│   │   ├── FieldLineCanvas.jsx    // Canvas 드로잉
│   │   └── Surface3D.jsx          // Plotly 3D
│   ├── services/
│   │   ├── firebase.js            // Firestore, Auth
│   │   └── interpolate.js         // IDW 보간
│   └── utils/
│       ├── equipotential.js       // 등전위선 계산
│       └── fieldLine.js           // 전기력선 계산 (AI)
├── public/
└── firebase.json
```

---

## 11. 핵심 알고리즘 메모

### 등전위선 렌더링
```
측정값 (x, y, V) 희소 데이터
  → IDW 보간으로 8×8 → 고밀도 격자 생성
  → D3 contour (marching squares)
  → SVG 등고선 렌더링
```

### AI 전기력선 계산
```
보간된 전위 격자
  → 각 점에서 gradient 계산 (-∇V)
  → gradient 방향으로 streamline 추적
  → 전극(+)에서 출발 → 전극(-)으로 수렴
```

### 전기력선 수직도 점수
```
학생이 그린 선분들
  → 각 선분과 교차하는 등전위선 찾기
  → 교차 각도 측정 (90°에 가까울수록 좋음)
  → 평균 수직도 → 점수화 (0~100)
```

---

> **내년 추가 예정**: Pico W + ADS1115 자동 측정, Three.js 업그레이드 (전기장 3D 애니메이션)
