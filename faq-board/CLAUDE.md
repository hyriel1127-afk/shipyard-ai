# CLAUDE.md

이 파일은 Claude Code가 이 저장소에서 일할 때 따르는 게시판 규칙과 사용 목적을 정의한다.
세부 요구사항은 `specs/001-qna-board/spec.md`, 원칙의 원문은 `.specify/memory/constitution.md`(v2.0.0)가 우선한다.

## 사용 목적

사내 프로그램 문의 QnA 게시판이다. Vercel(서버리스 함수)에 배포하고 Neon(Postgres)에 저장한다. 같은 문의가 메신저와 메일로 반복해서 들어오는 문제를 줄이려고 만들었다.

- 직원이 프로그램 ID를 붙여 사용법, 오류, 권한 관련 질문을 올린다.
- 사전에 지정된 답변 담당자만 답변을 쓴다.
- 질문과 답변이 한곳에 쌓이고 프로그램 ID로 찾을 수 있어서, 직원은 기존 답변을 먼저 확인하고 담당자는 같은 답을 되풀이하지 않는다.
- 이 프로젝트는 강의 과제 제출 범위다. 세션 쿠키 `Secure`는 Vercel(HTTPS)에서 자동 적용되며, 로그인 잠금·서명 토큰은 범위 밖이다.

### 범위 밖 (요청이 와도 임의로 구현하지 않는다)

- 답변 채택
- 사내 SSO 연동
- 사내 프로그램 DB 실시간 연동
- 로그인 잠금, 서명 토큰

## 게시판 규칙

### 사용자와 권한

- **일반 직원**: 질문 목록·상세는 로그인 없이 읽을 수 있다. 질문과 답변 등록은 로그인이 필요하다(미로그인 시 "로그인이 필요합니다.").
- **답변 담당자**: 사번 목록에 지정된 사용자만 답변을 쓴다. 지정과 해제는 `node scripts/admin.js add-answerer|remove-answerer <사번>` 으로만 한다. 해제해도 이전 답변은 유지한다.
- 답변 담당자 목록은 화면과 HTTP 응답에 노출하지 않는다.

### 질문과 프로그램 ID

- 질문에는 프로그램 ID를 반드시 하나 입력한다.
- 형식은 `^[A-Z]{4}[0-9]{4}[A-Z]?$` 이다(예: `PRGM0001`).
- 허용 프로그램 ID 목록은 `data/programs.json`(문자열 배열)이다. 관리자가 운영 절차로 관리하며 화면 기능은 없다. 저장하면 서버 재시작 없이 반영된다.
- 목록에서 ID를 빼도 기존 질문과 필터는 그대로 동작하고, 그 ID로 새 질문만 등록할 수 없다.
- 오류 문구는 고정한다. 입력 누락은 "프로그램 ID를 입력해 주세요.", 형식 오류는 "프로그램 ID 형식이 올바르지 않습니다.", 목록에 없으면 "등록되지 않은 프로그램 ID입니다."이다. 검증에 실패해도 입력한 제목과 내용은 유지한다.
- 질문 목록은 프로그램 ID로 거를 수 있다.

### 데이터

- 질문·답변·작성자 정보는 영구 보관한다(삭제 없음).
- 스냅샷(`data/snapshot/qna.md`)과 주간 보고서(`reports/`)는 DB에서 만든 파생 파일이며 git에 올리지 않는다. 작성자 사번·이름은 이 파일들에 넣지 않는다.

## 개발 원칙 (헌법 요약)

위반하면 병합할 수 없다. 원문의 "확인 방법"을 리뷰 체크리스트로 쓴다.

1. **API 테스트 우선** — 엔드포인트를 추가·변경할 때 구현보다 테스트를 먼저 쓰고, 실패(Red)를 확인한 뒤 구현한다. 성공, 검증 실패, 권한 오류 케이스를 둔다.
2. **최소 외부 패키지** — 허용된 패키지는 `@neondatabase/serverless`(운영 DB 드라이버)와 `@electric-sql/pglite`(테스트 전용 메모리 Postgres)뿐이다. 그 밖의 패키지를 추가하려면 사유를 해당 기능의 `plan.md`에 먼저 적는다.
3. **개인정보 로그 금지** — 이름, 사번을 어떤 로그에도 남기지 않는다. 요청·응답 본문을 통째로 출력하지 않는다. 식별이 필요하면 내부 식별자나 마스킹 값을 쓴다.
4. **한국어 화면과 KST** — 화면 문구(버튼, 안내, 오류 포함)는 한국어로 쓰고, 날짜·시각은 공용 KST 변환 함수(`src/time.js`)를 거쳐 표시한다.
5. **허용된 외부 서비스만, 외부 CDN 금지** — 외부 서비스는 Vercel(호스팅)과 Neon(DB)뿐이다. 스크립트, 스타일, 폰트, 이미지, 아이콘을 포함해 모든 정적 자원을 저장소에 두고 CDN은 쓰지 않는다. `DATABASE_URL`은 환경변수로만 받고 코드·로그·화면에 남기지 않는다.

## 명령

Node.js 24 이상이 필요하다(`.nvmrc`). 처음에는 `npm install`을 실행하고, `.env.example`을 `.env`로 복사해 `DATABASE_URL`(Neon)을 채운다. 테스트는 메모리 Postgres(PGlite)로 돌아 Neon 접속이 필요 없다.

```bash
npm run migrate -- up      # 스키마 생성/마이그레이션. 배포 전 사람이 실행(down은 테이블을 삭제하므로 Neon 브랜치 백업 후에만)
npm start                     # http://127.0.0.1:3000
npm test                      # node --test
npm run snapshot              # data/snapshot/qna.md 내보내기 (DB 읽기 전용)
npm run digest                # reports/digest-YYYY-MM-DD.md 주간 점검 보고서
npm run seed                  # 테스트용 계정·문의글 시드
```

환경변수는 `DATABASE_URL`(필수), `QNA_PORT`, `QNA_HOST`, `QNA_PROGRAMS`, `QNA_READONLY`, `QNA_SNAPSHOT_PATH`, `QNA_REPORTS_DIR`, `QNA_SECURE_COOKIE`, `TEST_DATABASE_URL`(선택) 이다. 자세한 설명은 `README.md`를 본다.

## 서브에이전트

`.claude/agents/`에 있으며 사용법은 `.claude/agents/README.md`를 본다.

- `answer-finder`: 새 문의와 비슷한 기존 질문·답변을 `data/snapshot/qna.md`에서 찾는다. 읽기 전용이다. 새 질문이 올라오면 먼저 이 에이전트로 기존 답변을 찾아 본다.
- `digest-notifier`: 주간 점검 보고서와 답변 권한자용 알림문 초안(`reports/notice-YYYY-MM-DD.md`)을 만든다. 훅이 허용 명령과 쓰기 경로를 제한한다.

두 에이전트 모두 게시판 코드를 수정하지 않고, 사번과 이름을 출력하지 않는다.

## 작업 방식

- 코드 구조: `api/index.js`(Vercel 진입점), `src/server.js`(처리기·로컬 서버), `src/db.js`(Neon 접속·마이그레이션, 모든 DB 접근은 async), `src/handlers`(요청 처리), `src/views`(화면), `src/migrations`(스키마), `tests/{contract,integration,unit}`.
- 새 기능은 `specs/NNN-기능명/`에 spec → plan → tasks 순서로 문서를 두고(speckit 스킬), 그 안의 계약(`contracts/`)을 따른다.
- 커밋 메시지는 `feat:` 같은 접두사와 한국어 요약을 쓴다.
- 응답과 화면 문구, 주석은 한국어로 쓴다.
