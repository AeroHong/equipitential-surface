import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

// 교사용 사용법 페이지(/help). 화면 이미지는 public/help/*.jpg — 실제 교사 계정 화면을
// 촬영해 넣었다. 이미지가 없으면(아직 촬영 전) 그 자리만 조용히 비운다.

function Shot({ src, alt }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    <figure className="my-4">
      <img
        src={`/help/${src}`}
        alt={alt}
        loading="lazy"
        onError={() => setFailed(true)}
        className="w-full rounded-xl border border-gray-200 shadow-sm"
      />
      <figcaption className="mt-1.5 text-center text-xs text-gray-400">{alt}</figcaption>
    </figure>
  )
}

function Steps({ children }) {
  return <ol className="my-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-gray-700">{children}</ol>
}

function Tip({ children, tone = 'indigo' }) {
  const tones = {
    indigo: 'border-indigo-100 bg-indigo-50 text-indigo-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    red: 'border-red-200 bg-red-50 text-red-800'
  }
  return <div className={`my-3 rounded-xl border px-4 py-3 text-sm leading-relaxed ${tones[tone]}`}>{children}</div>
}

function B({ children }) {
  return <b className="font-semibold text-gray-900">{children}</b>
}

const SECTIONS = [
  {
    id: 'start',
    title: '1. 시작하기',
    body: (
      <>
        <Steps>
          <li>학교 구글 계정으로 <B>구글 계정으로 로그인</B>합니다.</li>
          <li>처음 로그인하면 "아직 배정된 과제 링크가 없습니다" 화면이 보입니다. 아래의 <B>선생님이신가요? 교사 권한 요청하기</B>를 누르세요.</li>
          <li>관리자가 승인하면 새로고침 없이 교사 홈(배정 목록)으로 바뀝니다.</li>
        </Steps>
        <Shot src="teacher-request.png" alt="처음 로그인한 화면 — 교사 권한 요청하기" />
        <Shot src="home.jpg" alt="교사 홈 — 배정 목록과 상단 관리 메뉴" />
        <p className="text-sm text-gray-700">
          교사 홈 상단에서 <B>📝 서술형 문항 관리</B>, <B>📋 보고서 양식 관리</B>, <B>📄 지문 관리</B>로 이동하고,
          <B> + 새 배정 만들기</B>로 학생에게 나눠줄 과제를 만듭니다. 기본 순서는
          <B> 지문·문항 준비 → 배정 만들기 → 링크 공유(또는 Classroom 게시) → 대시보드에서 진행 확인 → 재생·채점</B>입니다.
        </p>
      </>
    )
  },
  {
    id: 'passages',
    title: '2. 지문 관리',
    body: (
      <>
        <p className="text-sm text-gray-700">학생이 읽고 답할 읽기자료입니다. "서술형(지문 + 자유서술)" 배정에는 반드시 필요하고, 다른 유형에서는 선택입니다.</p>
        <Steps>
          <li><B>📄 지문 관리</B> → <B>+ 새 지문</B>을 누릅니다.</li>
          <li><B>제목</B>과 <B>본문</B>을 작성합니다. 이미지는 붙여넣기(Ctrl+V)나 끌어다 놓기로 넣고, <B>/</B>를 치면 서식 메뉴가 뜹니다.</li>
          <li>한글/워드로 만든 자료가 있으면 <B>DOCX 읽기자료 불러오기</B>로 서식·이미지째 가져올 수 있습니다.</li>
          <li>필요하면 <B>영상 URL</B>(유튜브), <B>논술 문항</B>, <B>목표 분량 가이드</B>를 채우고 저장합니다.</li>
        </Steps>
        <Shot src="passage-editor.jpg" alt="지문 작성 화면" />
        <Tip>이미 배정에 쓰인 지문을 고치면 그 배정의 학생 화면에도 반영됩니다. 시험 중에는 수정하지 마세요.</Tip>
      </>
    )
  },
  {
    id: 'templates',
    title: '3. 보고서 양식 관리',
    body: (
      <>
        <p className="text-sm text-gray-700">탐구보고서처럼 학생이 <B>정해진 항목(섹션)을 순서대로 채우는</B> 양식입니다.</p>
        <Steps>
          <li><B>📋 보고서 양식 관리</B> → <B>+ 새 양식</B>.</li>
          <li><B>양식 제목</B>, <B>양식 설명</B>(학생 화면 상단에 표시)을 입력합니다.</li>
          <li><B>+ 섹션 추가</B>로 항목을 만들고 각 섹션의 <B>소제목</B>, <B>안내 문구</B>, <B>분량 가이드</B>를 입력합니다. <B>그룹 라벨</B>이 같은 섹션이 연속되면 화면에서 묶여 보입니다.</li>
          <li>"서술형 평가-문항" 배정에서 채점하려면 섹션마다 <B>배점</B>을 넣습니다.</li>
        </Steps>
        <Shot src="template-editor.jpg" alt="보고서 양식 편집 화면" />
      </>
    )
  },
  {
    id: 'question-sets',
    title: '4. 서술형 문항 관리',
    body: (
      <>
        <p className="text-sm text-gray-700">시험 문항처럼 <B>문항마다 그림·수식이 들어간 문제</B>를 만들 때는 보고서 양식보다 이 메뉴가 편합니다.</p>
        <Steps>
          <li><B>📝 서술형 문항 관리</B> → <B>+ 새 문항 세트</B>.</li>
          <li><B>문항 세트 제목</B>과 <B>공통 안내</B>(모든 문항에 공통인 조건·그림·표)를 입력합니다.</li>
          <li><B>+ 문항 추가</B>로 문항을 만들고, <B>문항 내용</B>에 글과 그림(붙여넣기/끌어다 놓기)을 넣습니다.</li>
          <li>문항별 <B>배점</B>과 <B>분량 가이드</B>를 입력하고 저장합니다.</li>
        </Steps>
        <Shot src="question-set-editor.jpg" alt="서술형 문항 세트 편집 화면" />
      </>
    )
  },
  {
    id: 'assignments',
    title: '5. 배정 만들기',
    body: (
      <>
        <Steps>
          <li>교사 홈에서 <B>+ 새 배정 만들기</B>.</li>
          <li><B>응답 유형</B>을 고릅니다.
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li><B>서술형 (지문 + 자유서술)</B> — 지문 필수, 답안은 한 칸.</li>
              <li><B>서술형 평가-문항 (양식별 답변 + 채점)</B> — 문항 세트/양식의 문항별로 답하고, 교사가 문항별 점수를 매깁니다. <B>공학용 계산기</B>를 켤 수 있습니다.</li>
              <li><B>구조화된 보고서</B> — 양식의 항목별로 작성, 채점 없음.</li>
            </ul>
          </li>
          <li>양식/문항 세트와 지문을 고르고 <B>배정 제목</B>, <B>마감일</B>을 입력합니다.</li>
          <li>모두 같은 시각에 시작하려면 <B>⏳ 평가 시작 전 준비 시간(대기실)</B>을 켭니다. 학생은 문항 없이 연습용 입력창·계산기만 보다가, 대시보드에서 <B>▶ 평가 시작</B>을 누르는 순간 문항을 받습니다.</li>
          <li><B>제한시간</B>을 정하면 남은 시간이 학생 화면에 표시되고, 끝나면 쓴 내용까지 자동 제출됩니다.</li>
          <li>제한시간이 있으면 <B>🚨 화면 이탈 감지</B>가 기본으로 켜집니다(아래 6·8장 참고).</li>
          <li>Classroom 연결이 되어 있으면 게시할 수업을 골라 <B>지금 게시</B> 또는 <B>예약 게시</B>합니다. 아니면 저장 후 대시보드의 <B>학생용 작성 링크</B>를 복사해 공유합니다.</li>
        </Steps>
        <Shot src="assignment-editor.jpg" alt="배정 만들기 화면" />
        <Tip tone="amber">
          Classroom에 처음 연결하면 구글이 <B>"Google에서 확인하지 않은 앱"</B> 경고를 띄웁니다. 학교에서 직접 운영하는 앱이라 구글 심사를 받지 않았기 때문이며,
          <B> 고급 설정</B>(또는 "고급")을 누른 뒤 맨 아래 <B>essay-hck.web.app(으)로 이동(안전하지 않음)</B>을 누르고 권한을 허용하면 됩니다.
        </Tip>
        <Shot src="classroom-unverified.png" alt="Classroom 연결 시 나오는 구글 경고 — 고급 설정 → 이동" />
        <Tip>배정 카드의 <B>복제</B>를 누르면 설정은 그대로, 제출물·Classroom 게시만 새로 하는 배정을 만들 수 있습니다(다른 반, 재시험 등).</Tip>
      </>
    )
  },
  {
    id: 'dashboard',
    title: '6. 대시보드 — 진행 확인과 화면 이탈 알림',
    body: (
      <>
        <p className="text-sm text-gray-700">배정 카드를 누르면 대시보드가 열립니다. 학생이 들어오면 표에 한 줄씩 생기고 실시간으로 갱신됩니다.</p>
        <Shot src="dashboard.jpg" alt="배정 대시보드" />
        <ul className="my-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-gray-700">
          <li><B>접속</B>: 보는 중 / 입력 중 / 다른 탭 / 오프라인이 실시간으로 표시됩니다.</li>
          <li><B>화면 이탈</B>(제한시간 평가만): 학생이 다른 탭·앱으로 가거나 전체화면을 빠져나간 횟수와 누적 시간. 이탈하는 순간 오른쪽 위에 <B>⚠ ○○○ 화면 이탈</B> 알림과 알림음이 나오고, 오른쪽 아래 <B>🚨 이탈 알림</B>에 목록이 쌓입니다. 알림을 누르면 그 학생 줄로 이동합니다. 대시보드 탭이 뒤에 있어도 탭 제목에 <B>(⚠N)</B>이 붙습니다.</li>
          <li><B>붙여넣기 비율</B>, <B>AI 의심 신호</B>: 직접 썼는지 판단하는 참고 지표입니다.</li>
          <li><B>메모</B>: 학생에게 보이지 않는 교사 메모(예: 감독 중 목격 내용).</li>
          <li><B>강제 제출</B>: 작성 중인 학생 화면을 즉시 잠그고 제출 처리합니다. <B>재열기</B>: 제출한 학생이 다시 고칠 수 있게 합니다(그 학생만 제한시간이 풀립니다. 화면 이탈 감지는 계속됩니다).</li>
        </ul>
        <Tip tone="amber">이탈 알림은 <B>이 대시보드를 열어 둔 뒤</B> 생긴 이탈만 팝업으로 띄웁니다. 그 전 기록은 표의 "화면 이탈" 칸과 재생 화면에서 확인하세요.</Tip>
      </>
    )
  },
  {
    id: 'replay',
    title: '7. 재생 · 채점 · 점수 공개',
    body: (
      <>
        <Steps>
          <li>대시보드 표에서 학생 줄을 누르면 재생 화면이 열립니다.</li>
          <li>왼쪽은 <B>전체 작성 내용</B>(DOCX/PDF 내보내기), 오른쪽은 <B>작성 과정 로그</B> — 재생 버튼으로 글이 쓰인 과정을 그대로 볼 수 있고 붙여넣은 부분이 표시됩니다.</li>
          <li>제한시간 평가에서 이탈이 있었다면 <B>🚨 화면 이탈 기록</B>에 시각·유형·지속시간이 나옵니다.</li>
          <li>"서술형 평가-문항"이면 아래 채점 칸에 문항별 점수를 넣고 <B>점수 저장</B>. 학생은 <B>학생에게 공개</B>를 눌러야 점수를 볼 수 있습니다(대시보드의 <B>점수 전체 공개</B>로 한 번에 공개도 가능).</li>
        </Steps>
        <Shot src="replay-grading.jpg" alt="재생 화면 — 채점 칸과 화면 이탈 기록(제한시간 평가)" />
        <Shot src="replay.png" alt="재생 화면 — 왼쪽 전체 작성 내용, 오른쪽 작성 과정 로그와 재생 막대" />
      </>
    )
  },
  {
    id: 'tablet',
    title: '8. 시험 전 태블릿 준비 (다른 탭·앱 차단)',
    body: (
      <>
        <Tip tone="red">
          웹페이지는 보안상 <B>학생 태블릿의 다른 탭을 닫거나, 열려 있는지 확인하거나, 막을 수 없습니다.</B>
          그래서 이 앱은 <B>① 전체화면으로 시작하게 하고 ② 벗어나면 감지해 알리는</B> 방식입니다.
          완전히 막으려면 아래의 기기 자체 기능을 시험 전에 켜도록 안내하세요.
        </Tip>
        <h4 className="mt-4 text-sm font-bold text-gray-800">공통 — 시작 전 안내</h4>
        <ul className="my-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
          <li>시험과 관계없는 탭·앱은 모두 닫고, 알림(메신저 등)은 방해 금지 모드로 끕니다.</li>
          <li>과제 링크로 들어가 <B>전체화면으로 시작하기</B>를 누릅니다. 전체화면을 빠져나가거나 다른 앱으로 가면 경고창이 뜨고 선생님께 기록됩니다.</li>
          <li>답안에 사진을 첨부할 때 열리는 사진 선택 창은 이탈로 치지 않습니다.</li>
        </ul>
        <h4 className="mt-4 text-sm font-bold text-gray-800">안드로이드 (갤럭시탭 등)</h4>
        <ul className="my-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
          <li><B>앱 설치(권장)</B>: Chrome에서 이 사이트를 연 뒤 메뉴(⋮) → <B>앱 설치</B>(또는 "홈 화면에 추가"). 설치하면 탭·주소창이 없는 전체화면 앱으로 열립니다.</li>
          <li><B>화면 고정(가장 확실)</B>: 설정 → 보안 및 개인정보 보호 → 기타 보안 설정 → <B>앱 고정</B> 켜기 → 최근 앱 화면에서 평가 앱 아이콘을 눌러 <B>이 앱 고정</B>. 해제하려면 뒤로+최근 앱 버튼을 함께 길게 누릅니다(기종마다 메뉴 이름이 조금 다를 수 있습니다).</li>
        </ul>
        <h4 className="mt-4 text-sm font-bold text-gray-800">아이패드</h4>
        <ul className="my-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
          <li><B>사용법 유도(가장 확실)</B>: 설정 → 손쉬운 사용 → <B>사용법 유도</B> 켜기(암호 설정) → 평가 화면에서 <B>상단(또는 홈) 버튼을 세 번</B> 눌러 시작. 끝낼 때도 세 번 누르고 암호 입력.</li>
          <li>아이패드는 기종·브라우저에 따라 웹 전체화면이 지원되지 않을 수 있습니다. 그래도 다른 앱·탭으로 가면 감지·기록은 됩니다.</li>
        </ul>
        <Shot src="student-start.jpg" alt="학생 화면 — 평가 시작(전체화면) 안내" />
        <Shot src="student-warning.jpg" alt="학생 화면 — 화면 이탈 경고" />
      </>
    )
  },
  {
    id: 'students',
    title: '9. 학생 화면 안내',
    body: (
      <ul className="my-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-gray-700">
        <li>학생은 공유된 링크로 들어와 학교 구글 계정으로 로그인합니다. 개인 계정으로 들어오면 <B>학번과 이름</B>을 한 번 입력합니다.</li>
        <li>쓰는 내용은 자동 저장됩니다(오른쪽 위 저장 상태 표시). 창을 닫았다가 다시 들어와도 이어서 쓸 수 있습니다.</li>
        <li>수식은 편집기의 수식 버튼으로, 표는 ▦ 버튼으로 넣습니다. 계산기가 켜진 배정은 오른쪽(좁은 화면에서는 🧮 버튼)에 공학용 계산기가 있습니다.</li>
        <li><B>제출하기</B>를 누르면 선생님이 다시 열어주기 전까지 고칠 수 없습니다.</li>
      </ul>
    )
  }
]

export default function HelpPage() {
  const navigate = useNavigate()
  const [active, setActive] = useState(SECTIONS[0].id)

  // 스크롤 위치에 맞춰 목차 강조
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (visible[0]) setActive(visible[0].target.id)
    }, { rootMargin: '-80px 0px -60% 0px' })
    SECTIONS.forEach(s => { const el = document.getElementById(s.id); if (el) observer.observe(el) })
    return () => observer.disconnect()
  }, [])

  function jump(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
        <button onClick={() => navigate('/admin')} className="text-gray-400 transition-colors hover:text-gray-600" aria-label="돌아가기">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-base font-bold text-gray-900">❓ 사용법</h1>
      </header>

      {/* 좁은 화면: 가로 스크롤 목차 */}
      <nav className="sticky top-[53px] z-[9] flex gap-1.5 overflow-x-auto border-b border-gray-200 bg-white px-4 py-2 lg:hidden">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            onClick={() => jump(s.id)}
            className={`shrink-0 rounded-full border px-3 py-1 text-xs ${active === s.id ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500'}`}
          >
            {s.title.replace(/^\d+\.\s*/, '').split(' — ')[0]}
          </button>
        ))}
      </nav>

      <div className="mx-auto flex max-w-5xl gap-8 px-4 py-6">
        <nav className="sticky top-20 hidden h-fit w-56 shrink-0 lg:block">
          <ul className="space-y-0.5">
            {SECTIONS.map(s => (
              <li key={s.id}>
                <button
                  onClick={() => jump(s.id)}
                  className={`w-full rounded-lg px-3 py-1.5 text-left text-sm ${active === s.id ? 'bg-indigo-50 font-semibold text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  {s.title}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <main className="min-w-0 flex-1 space-y-6">
          {SECTIONS.map(s => (
            <section key={s.id} id={s.id} className="scroll-mt-28 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
              <h2 className="mb-3 text-lg font-bold text-gray-900">{s.title}</h2>
              {s.body}
            </section>
          ))}
        </main>
      </div>
    </div>
  )
}
