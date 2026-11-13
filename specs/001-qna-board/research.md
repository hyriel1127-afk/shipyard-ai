# Phase 0 Research: 사내 프로그램 문의 QnA 게시판

spec에 NEEDS CLARIFICATION은 남아 있지 않다. 기술 선택과 로그인 방식(Assumptions: "계획 단계에서 정한다")을 아래와 같이 결정했다.

## R1. 런타임과 웹 계층
- **Decision**: Node.js 24 LTS+ 와 내장 `node:http`. 서버 렌더링 HTML, 폼 POST 후 303 리다이렉트(PRG).
- **Rationale**: 헌법 II(최소 패키지), V(사내망). 프레임워크·번들러·CDN 없이 동작. 개발 환경에 Node v26이 이미 있음.
- **Alternatives**: Express/Fastify(패키지 반입 비용), Python+FastAPI(패키지 다수), SPA(번들 도구·패키지 필요).

## R2. 저장소
- **Decision**: `node:sqlite` 단일 파일 DB, WAL 모드, 마이그레이션 SQL을 파일로 관리.
- **Rationale**: 외부 DB 서버 없이 10,000건 규모·동시 100명을 충분히 처리. 백업은 파일 복사.
- **Alternatives**: 사내 RDBMS(드라이버 패키지와 운영 협의 필요), JSON 파일(동시성·인덱스 부족).
- **Note**: 목록은 `(id DESC)`, `(program_id, id DESC)` 인덱스 + `LIMIT 20 OFFSET`으로 NFR-PERF-003 충족.

## R3. 로그인 (SSO 제외)
- **Decision**: 사번+비밀번호 폼 로그인. 계정은 관리자가 CLI로 등록. 비밀번호는 `crypto.scrypt`(솔트 포함)로 해시. 세션은 무작위 256비트 토큰을 `HttpOnly; SameSite=Lax` 쿠키에 담고 서버(DB)에는 SHA-256 해시만 저장(만료 8시간).
- **Rationale**: SSO가 범위 밖이므로 자체 최소 인증이 필요. 외부 패키지 없이 `node:crypto`로 가능. 실패 시 사번 존재 여부를 구분하지 않는 동일 문구. 계정 잠금·HTTPS 쿠키 `Secure` 등 운영용 방어는 과제 범위 밖(plan.md 위험 9).
- **Alternatives**: HTTP Basic(로그아웃·UX 불량), 사번만 입력(인증이 아님).
- **Follow-up**: 후속 SSO 도입 시 `auth.js`만 교체하도록 사용자 식별을 내부 `user_id`로 추상화.

## R4. 답변 권한
- **Decision**: `answerers(emp_no)` 테이블이 답변 담당자 사번 목록. 답변 등록 핸들러가 세션 사용자의 사번을 매 요청마다 이 테이블에서 조회해 검사(FR-011). 화면 숨김은 부가 처리.
- **Rationale**: 목록 변경이 운영 절차(CLI)로 즉시 반영되고 이전 답변은 유지된다(Edge Case). 목록은 어떤 화면·응답에도 싣지 않는다(NFR-SEC-005).

## R5. 프로그램 ID 검증 순서
- **Decision**: trim → 빈 값이면 "누락" → 정규식 `^[A-Z]{4}[0-9]{4}[A-Z]?$` 불일치면 "형식" → `data/programs.json` 목록에 없으면 "미등록". 목록 필터에서는 형식 오류·미등록 모두 빈 목록 + "해당 프로그램 ID의 질문이 없습니다."(US2-6).
- **Rationale**: spec FR-003~005 순서 그대로. 등록과 필터가 `validation.js`의 같은 규칙을 공유. 목록 원천은 `data/programs.json`(mtime 변경 시 재로드, 상세는 plan.md). 검증 실패 HTTP 상태는 400.

## R6. 중복 제출 방지
- **Decision**: 작성 폼마다 서버가 발급한 무작위 `form_token`(`crypto.randomUUID()`, hidden)을 `questions.form_token UNIQUE`, `answers.form_token UNIQUE`로 저장. 이미 저장에 쓰인 토큰으로 재요청하면 새로 만들지 않고 이미 만든 글로 이동. 검증 실패(400) 재렌더링에서는 같은 토큰을 다시 넣는다. 버튼은 제출 시 비활성화(부가).
- **Rationale**: 서버 측에서 "1건만 등록"을 보장(Edge Case). CSRF 토큰과는 별개.

## R7. 보안 헤더·XSS·CSRF
- **Decision**: 모든 출력은 `html.js`의 `esc()`를 거치는 태그드 템플릿으로 생성(NFR-SEC-003). 모든 POST에 세션 묶음 CSRF 토큰 필수. 응답 헤더에 `Content-Security-Policy: default-src 'self'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.
- **Rationale**: 프레임워크 없이도 최소 방어선을 한곳에 모아 테스트할 수 있다.

## R8. 시각 처리
- **Decision**: DB에는 UTC epoch 밀리초 정수로 저장. 표시는 `Intl.DateTimeFormat('ko-KR', {timeZone: 'Asia/Seoul', ...})`의 부분 값으로 `YYYY-MM-DD HH:mm`을 조립(`time.js`).
- **Rationale**: 외부 날짜 라이브러리 불필요. 헌법 IV의 공용 변환 함수 요건 충족.

## R9. 로그
- **Decision**: `logger.event({event, result, ref_id?, user_id?, method?, route?})` 한 함수만 허용, JSON 한 줄을 stdout으로. 허용 필드와 이벤트 목록(`login`, `auth.required`, `auth.denied`, `question.create`, `answer.create`, `http.access`, `programs.load_failed`)은 contracts/http-endpoints.md "로그 계약"이 기준. 접근 로그는 `event=http.access` + `method` + `route`(경로 템플릿) + `result`(상태코드), 쿼리스트링 제외.
- **Rationale**: 필드를 허용 목록으로 고정해 개인정보 유입을 구조적으로 차단(헌법 III, NFR-LOG).

## R10. 접근성
- **Decision**: 시맨틱 HTML, 모든 입력에 `<label for>`, 오류는 `aria-describedby`로 입력란과 연결하고 `role="alert"` 요약 제공, 오류 문구에 "오류:" 접두 텍스트 포함(색 단독 구분 금지), 본문 대비 4.5:1 이상 팔레트를 `style.css`에 고정.
