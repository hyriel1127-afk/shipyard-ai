# Tasks: 사내 프로그램 문의 QnA 게시판

**Input**: `specs/001-qna-board/` 의 plan.md, spec.md, research.md, data-model.md, contracts/http-endpoints.md, quickstart.md

**Prerequisites**: Node.js 24 이상. 외부 패키지는 쓰지 않는다(헌법 II) — `package.json`에 `dependencies`/`devDependencies`를 추가하지 않는다.

**Tests**: **필수**. 헌법 I(API 테스트 우선)에 따라 각 단계에서 테스트 작업이 구현 작업보다 앞서며, 구현 전에 테스트가 실패(Red)하는 것을 확인한 뒤 구현한다. 테스트 실행: `npm test` (= `node --test`).

**범위 메모**: 강의 과제 제출용이다. spec·헌법에 적힌 요구는 모두 유지하고, 운영용 방어(HTTPS 종단, 쿠키 `Secure`, 로그인 잠금, 서명 토큰)는 범위 밖이다(plan.md 위험 9). `(선택)` 표시 작업(T038, T051, T056)은 시간이 남을 때만 한다.

**Organization**: 사용자 스토리별로 묶었다. US1(P1) → US2(P2) → US3(P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 다른 파일을 다루고 미완료 작업에 의존하지 않아 병렬 실행 가능
- **[Story]**: US1/US2/US3 (Setup·Foundational·Polish에는 없음)
- 경로는 저장소 루트 기준. 모든 화면 문구는 `src/messages.js`의 한국어 문구만 사용한다.

## Phase 1: Setup

**Purpose**: 프로젝트 뼈대

- [X] T001 `package.json` 생성: `"type": "module"`, `"engines": {"node": ">=24"}`, scripts `start`(`node src/server.js`), `test`(`node --test`), `migrate`(`node scripts/migrate.js`), `admin`(`node scripts/admin.js`). 의존성 항목은 두지 않는다
- [X] T002 [P] `.nvmrc`(`24`)와 `.gitignore`(`data/*.sqlite*`, `node_modules/`) 작성
- [X] T003 [P] plan.md의 구조대로 빈 디렉터리 생성: `src/handlers/`, `src/views/`, `src/migrations/`, `public/`, `scripts/`, `tests/contract/`, `tests/integration/`, `tests/unit/`, `tests/helpers/` (각 디렉터리에 `.gitkeep`)
- [X] T004 [P] `data/programs.json` 생성: `["PRGM0001", "PRGM0002"]` (문자열 배열, 시스템 관리자가 운영 절차로 편집하는 유일한 유효 프로그램 ID 원천)

---

## Phase 2: Foundational (모든 사용자 스토리의 선행 조건)

**Purpose**: DB, 설정, 공통 검증, 인증, 로깅, 시각 표시, 서버 뼈대. **이 단계가 끝나기 전에는 어떤 스토리도 시작할 수 없다.**

### 테스트 먼저 (실패 확인 후 구현)

- [X] T005 [P] `tests/helpers/server.js` 작성: 임시 DB 파일·임의 포트·임시 `programs.json`으로 `createApp({dbPath, programsPath, port})`(src/server.js가 export)를 띄우고 종료하는 헬퍼, 사용자 시드(`seedUser(empNo, name, password, {answerer})`), 로그인 후 쿠키·csrf 토큰을 돌려주는 `login()`, stdout 로그 캡처 `captureLogs()`
- [X] T006 [P] `tests/unit/time.test.js`: `formatKst()`가 `YYYY-MM-DD HH:mm`으로 표시하는지. UTC 2026-11-12 15:30 → "2026-11-13 00:30", UTC 14:59 → "2026-11-12 23:59", UTC 15:00 → "2026-11-13 00:00" (NFR-L10N-002, 헌법 IV)
- [X] T007 [P] `tests/unit/html-escape.test.js`: `esc()`와 태그드 템플릿이 `<`, `>`, `&`, `"`, `'`를 모두 이스케이프하고 `<script>alert(1)</script>`가 글자 그대로 출력되는지 (NFR-SEC-003)
- [X] T008 [P] `tests/unit/logger.test.js`: `logger.event()`가 `event, at, result, ref_id, user_id, method, route` 외의 필드를 버리는지, `route`에 `?`나 숫자 id가 들어오면 거부하는지, 이름·사번·본문 문자열을 넣어도 출력에 나타나지 않는지, JSON 한 줄인지 (NFR-LOG-001/002, 헌법 III)
- [X] T009 [P] `tests/unit/programs-file.test.js`: `programs.has()`가 목록 포함 여부를 판단하는지, 파일 수정(mtime 변경) 시 재시작 없이 반영되는지, JSON이 깨지면 마지막 정상 목록을 유지하고 `programs.load_failed` 로그를 남기는지, 최초 로드 실패 시 `unavailable` 상태를 돌려주는지 (FR-005)
- [X] T010 [P] `tests/unit/validation.test.js`: 공통 `validate(schema, input, ctx)`를 검증. program_id: 앞뒤 공백 제거, 빈 값/공백만 → `PROGRAM_ID_REQUIRED`, 정규식 `^[A-Z]{4}[0-9]{4}[A-Z]?$` 불일치(8자·9자 통과, `PRGM001`, `prgm0001`, `prg 1`, 10자 실패) → `PROGRAM_ID_FORMAT`, 목록에 없음 → `PROGRAM_ID_UNKNOWN`. title: 공백만 → `TITLE_REQUIRED`, 100자 통과·101자 → `TITLE_TOO_LONG`. body: 공백만 → `BODY_REQUIRED`, 4,000자 통과·4,001자 → `BODY_TOO_LONG`(코드포인트 기준). `program_id`가 배열(필드 여러 개)이면 `PROGRAM_ID_FORMAT`, 여러 필드 오류를 한꺼번에 반환 (FR-002~004, FR-018, Edge Cases)
- [X] T011 [P] `tests/integration/migration-roundtrip.test.js`: 빈 DB에서 up → 테이블 5개(`users, answerers, questions, answers, sessions`)와 `schema_migrations` 존재, down → 모두 제거, 다시 up 성공. `questions.program_id` 빈 문자열 INSERT가 CHECK로 거부되고 NULL INSERT도 거부되는지 (plan.md 되돌리기)
- [X] T012 [P] `tests/contract/auth.test.js`: 계약 #1~#3 및 공통 규칙. 미로그인 GET `/`, `/questions/new`, `/questions/1` → 401 "로그인이 필요합니다."(질문 내용 비노출), 미로그인 POST `/questions`, `/questions/1/answers` → 401·저장 없음, 올바른 로그인 → 303 `/` + `sid` 쿠키(HttpOnly, SameSite=Lax), 틀린 비밀번호·없는 사번 → 401 동일 문구 "사번 또는 비밀번호가 올바르지 않습니다.", POST에서 `csrf` 누락·불일치 → 403, 로그아웃 후 세션 무효, 응답 헤더 `Content-Security-Policy: default-src 'self'`·`X-Content-Type-Options: nosniff`, 미로그인 요청 후 캡처한 로그에 `auth.required`(result=denied)가 기록되고 로그인 실패 후 `login`/denied가 기록되며 두 경우 모두 사번·이름이 없음 (FR-014, NFR-SEC-001, NFR-LOG-001/002)

### 구현

- [X] T013 [P] `src/config.js`: 환경변수 `QNA_PORT`(기본 3000), `QNA_HOST`(기본 `127.0.0.1`; 사내망 주소는 운영자가 지정), `QNA_DB`(기본 `./data/qna.sqlite`), `QNA_PROGRAMS`(기본 `./data/programs.json`), `QNA_READONLY`
- [X] T014 [P] `src/migrations/001_init.up.sql`: data-model.md 그대로 테이블 5개 + `schema_migrations(version TEXT PK, applied_at INTEGER NOT NULL)`. `questions.program_id TEXT NOT NULL CHECK (length(program_id) > 0 AND (program_id GLOB '[A-Z][A-Z][A-Z][A-Z][0-9][0-9][0-9][0-9]' OR program_id GLOB '[A-Z][A-Z][A-Z][A-Z][0-9][0-9][0-9][0-9][A-Z]'))`(FK 없음), `questions.title` 1~100자 CHECK, `questions.body`·`answers.body` 1~4,000자 CHECK, `form_token TEXT UNIQUE NOT NULL`(questions, answers), `users.emp_no UNIQUE NOT NULL`, `answerers.emp_no PK`, 인덱스 `questions(id DESC)`, `questions(program_id, id DESC)`, `answers(question_id, id ASC)`. 태그·채택 열을 만들지 않는다 (FR-006, FR-016)
- [X] T015 [P] `src/migrations/001_init.down.sql`: `answers` → `questions` → `sessions` → `answerers` → `users` 순으로 인덱스와 테이블 DROP (`schema_migrations` 행 삭제 포함)
- [X] T016 `src/db.js`(`node:sqlite` 연결, WAL, `PRAGMA foreign_keys=ON`, 마이그레이션 up/down 실행, 모든 DB 접근을 이 모듈에 격리)와 `scripts/migrate.js`(`up`|`down` 인자, 실행 전 DB 파일 백업 복사본 생성, 트랜잭션 실행) — T011 통과시키기
- [X] T017 [P] `src/time.js`: `formatKst(epochMs)` — `Intl.DateTimeFormat('ko-KR', {timeZone: 'Asia/Seoul', hourCycle: 'h23'})` 부분값으로 `YYYY-MM-DD HH:mm` 조립. 화면의 모든 날짜는 이 함수만 사용 — T006 통과시키기
- [X] T018 [P] `src/html.js`: `esc()`와 태그드 템플릿 `html\`...\``(보간 값 자동 이스케이프, 명시적 `raw()`만 예외) — T007 통과시키기
- [X] T019 [P] `src/messages.js`: 한국어 문구 상수 모음 — "로그인이 필요합니다.", "답변 권한이 없습니다.", "존재하지 않는 질문입니다.", "프로그램 ID를 입력해 주세요.", "프로그램 ID 형식이 올바르지 않습니다.", "등록되지 않은 프로그램 ID입니다.", "제목을 입력해 주세요.", "제목은 100자 이내로 입력해 주세요.", "내용을 입력해 주세요.", "내용은 4,000자 이내로 입력해 주세요.", "답변 내용을 입력해 주세요.", "답변은 4,000자 이내로 입력해 주세요.", "해당 프로그램 ID의 질문이 없습니다.", "등록된 질문이 없습니다.", "아직 답변이 없습니다.", "사번 또는 비밀번호가 올바르지 않습니다." 등 contracts/http-endpoints.md에 나온 모든 문구. 오류 문구 접두 "오류:"는 뷰에서 붙인다
- [X] T020 [P] `src/logger.js`: `event({event, result, ref_id, user_id, method, route})` 한 함수만 export(필드 정의는 contracts "로그 계약"), 허용 필드 외는 버리고 `at`(ISO UTC)을 붙여 JSON 한 줄을 stdout에 출력 — T008 통과시키기
- [X] T021 `src/programs.js`: `data/programs.json` 로드, mtime 변경 시 재로드, 파손 시 마지막 정상 목록 유지 + `programs.load_failed` 로그, 최초 로드 실패 시 `state()`가 `unavailable` 반환, `has(id)` 제공 — T009 통과시키기 (T020 의존)
- [X] T022 `src/validation.js`: 공통 `validate(schema, input, ctx)` 하나로 program_id/title/body 규칙을 처리하고 오류 코드(`PROGRAM_ID_REQUIRED`, `PROGRAM_ID_FORMAT`, `PROGRAM_ID_UNKNOWN`, `TITLE_REQUIRED`, `TITLE_TOO_LONG`, `BODY_REQUIRED`, `BODY_TOO_LONG`)와 trim된 값을 반환. 모든 POST 핸들러는 이 함수만 거친다 — T010 통과시키기 (T019, T021 의존)
- [X] T023 `src/auth.js`: `crypto.scrypt` 해시·검증(타이밍 안전 비교), 로그인(사번 존재 여부 비구분), 세션 발급(무작위 256비트, DB에는 SHA-256 해시만, 만료 8시간), CSRF 토큰 검증, `require()`(미로그인 401, `auth.required` 로그 `result=denied`), 로그인 시 `login` 이벤트(`ok`/`denied`, 성공 시에만 `user_id`), `form_token` 발급(`crypto.randomUUID()`), `isAnswerer(userId)`(매 요청 `answerers` 조회) (T016 의존)
- [X] T024 `src/server.js`: `createApp()` export. `node:http` 라우팅 표(계약 #1~#3과 `GET /static/style.css`만 먼저 연결, #4~#8은 각 스토리의 핸들러 작업이 등록), 공통 응답 헤더(CSP `default-src 'self'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`), 쿠키·폼 본문 파싱, POST CSRF 검사, 404/500 처리(500 본문에 내부 정보 미노출), 접근 로그(`event=http.access`, `method`·`route` 템플릿·`result`=상태코드, 쿼리스트링 제외), `QNA_READONLY=1`이면 POST를 503, `programs.state()==='unavailable'`이면 질문 등록 503 (T017~T023 의존)
- [X] T025 `src/handlers/login.js`, `src/views/layout.js`, `src/views/login.js`: 로그인·로그아웃 화면과 처리. 레이아웃은 `<html lang="ko">`, 상단 사용자 이름과 로그아웃 버튼, `/static/style.css`만 로드, 모든 입력에 `<label for>`, 오류 영역 `role="alert"` + "오류:" 접두 — T012 통과시키기 (T024 의존)
- [X] T026 [P] `public/style.css`: 시스템 글꼴, 본문 대비 4.5:1 이상 팔레트, 오류는 색과 함께 문구로 표시, 포커스 표시 유지. 외부 URL(`url(http…)`, `@import`) 금지 (NFR-A11Y-003, 헌법 V)
- [X] T027 `scripts/admin.js`: 운영 CLI — `add-user <사번> <이름> <비밀번호>`, `set-password`, `add-answerer <사번>`, `remove-answerer <사번>`. 출력에 비밀번호를 남기지 않고, 답변 담당자 목록은 화면·HTTP 응답으로 노출하지 않는다(NFR-SEC-005). 프로그램 ID는 CLI가 아니라 `data/programs.json` 편집으로 관리한다 (T016, T023 의존)

**Checkpoint**: `npm test` 중 Foundational 테스트(T006~T012)가 모두 통과하고, `node scripts/migrate.js up` 후 서버가 로그인 화면을 띄운다.

---

## Phase 3: User Story 1 - 프로그램 ID를 붙여 질문 올리기 (Priority: P1) 🎯 MVP

**Goal**: 로그인한 사용자가 프로그램 ID와 함께 질문을 올리고, 목록과 상세에서 확인한다.

**Independent Test**: 로그인 → `PRGM0001`로 질문 등록 → 상세로 이동해 프로그램 ID·제목이 보이고 목록 맨 위에 같은 질문이 보인다. 누락·형식 오류·미등록 ID는 400으로 거부되고 입력이 유지된다.

### Tests for User Story 1 (먼저 작성, 실패 확인)

- [X] T028 [P] [US1] `tests/contract/questions-create.test.js`: 계약 #5·#6. 성공 → 303 `/questions/:id`, 목록 맨 위에 1건 추가, 상세에 프로그램 ID·제목·작성자·작성일시(KST) 표시, 작성자·작성일시 저장(FR-017). 400 케이스(각각 질문 수 불변, 정확한 문구, 오류 문구가 입력란과 `aria-describedby`로 연결, 제목·내용 입력값 유지): 프로그램 ID 누락 "프로그램 ID를 입력해 주세요.", `prg 1` "프로그램 ID 형식이 올바르지 않습니다.", `prgm0001` 소문자 형식 오류, `PRGM9999` "등록되지 않은 프로그램 ID입니다.", 공백만 입력은 누락, 앞뒤 공백 `" PRGM0001 "`은 성공, 제목 공백 "제목을 입력해 주세요.", 제목 101자, 내용 공백, 내용 4,001자, `program_id` 필드가 2개인 요청 → 400 "프로그램 ID 형식이 올바르지 않습니다.". 화면 선택 목록과 무관하게 서버가 `data/programs.json`으로 검증함을 증명하기 위해 curl식 직접 POST로 `PRGM9999` 시도. 태그 필드를 보내도 무시되고 저장되지 않음(FR-006). `<script>` 제목이 이스케이프되어 표시 (FR-001~007, FR-017, FR-018, SC-005)
- [X] T029 [P] [US1] `tests/integration/duplicate-submit.test.js`: 같은 `form_token`으로 `POST /questions`를 두 번(동시 2회 포함) 보내면 질문이 1건만 생성되고 둘 다 같은 상세로 303. 검증 실패(400) 후 같은 토큰으로 고쳐서 재제출하면 성공 (Edge Cases)
- [X] T030 [P] [US1] `tests/contract/questions-list.test.js`(기본 목록 부분): 계약 #4 필터 없는 목록. 행에 제목(상세 링크)·프로그램 ID·작성일(KST)·답변 수 표시, 최신 등록순. (필터·페이지·빈 상태 테스트는 US2에서 이 파일에 이어서 추가)

### Implementation for User Story 1

- [X] T031 [US1] `src/handlers/questions.js`의 `newForm`과 `create`: `GET /questions/new`는 서버가 1회용 `form_token`을 발급해 폼을 렌더링. `POST /questions`는 로그인 → CSRF → `validate()` 공통 검증 → 이미 저장에 쓰인 `form_token`이면 기존 질문으로 303 → 저장(`author_id`, `created_at`=UTC epoch ms) → 303 `/questions/:id`. 검증 실패는 400으로 같은 폼 재렌더(입력 유지, 같은 토큰 유지). 성공 시 `question.create` 로그(`result`, `ref_id`, `user_id`만) (T028, T029 통과)
- [X] T032 [P] [US1] `src/views/question-form.js`: 질문 작성 폼 — `program_id` 입력란(`<input list>`로 `data/programs.json`의 허용 ID를 제안만 하고 제한하지 않음), 제목(`maxlength` 표시 보조만; 서버 검증이 기준), 내용, 숨은 `csrf`·`form_token`, 제출 시 버튼 비활성화 스크립트 없이도 동작(서버가 중복 방지), 오류 문구는 "오류:" 접두 + `aria-describedby`로 해당 입력란과 연결
- [X] T033 [US1] `src/handlers/questions.js`의 `list`(기본)와 `detail`(기본): 필터 없는 목록 `ORDER BY id DESC LIMIT 20`과 답변 수 그룹 집계 1회, 상세는 질문 + 답변 목록(등록순). 질문 상세에서 존재하지 않는 id의 404는 US2에서 완성 (T030 통과)
- [X] T034 [P] [US1] `src/views/question-list.js`, `src/views/question-detail.js`: 목록 행(제목 링크, 프로그램 ID, `formatKst` 작성일, 답변 수)과 상세(프로그램 ID, 제목, 내용을 `esc()`로 출력, 작성자 이름, 작성일시 KST, 답변 영역은 "아직 답변이 없습니다."/목록). 글쓰기 링크 제공

**Checkpoint**: US1 단독으로 `npm test` 통과, quickstart의 US1 시나리오 수동 확인.

---

## Phase 4: User Story 2 - 질문 찾아 읽기와 프로그램 ID로 거르기 (Priority: P2)

**Goal**: 프로그램 ID 필터, 페이지 이동, 빈 상태·404 화면으로 기존 질문을 찾아 읽는다.

**Independent Test**: 서로 다른 프로그램 ID의 질문이 섞인 상태에서 특정 ID로 거르면 해당 질문만, 해제하면 전체가 나온다.

### Tests for User Story 2 (먼저 작성, 실패 확인)

- [X] T035 [US2] `tests/contract/questions-list.test.js`에 추가: `PRGM0001` 3건 + `PRGM0002` 2건에서 `?program_id=PRGM0001` → 3건·모두 `PRGM0001`, 필터 해제 링크 → 5건, 질문 없는 ID(허용 목록엔 있음) → "해당 프로그램 ID의 질문이 없습니다.", 형식 오류(`prg 1`)·미등록(`PRGM9999`) 값으로 거르기 → 오류 없이 200 + 같은 문구, 질문 0건 → "등록된 질문이 없습니다.", 21건일 때 1페이지 20건·`?page=2`에 1건, 필터와 페이지 동시 적용, 앞뒤 공백 `program_id=%20PRGM0001%20` 처리 (FR-008, FR-009, SC-003)
- [X] T036 [P] [US2] `tests/contract/question-detail.test.js`: 계약 #7. 상세에 프로그램 ID·제목·내용·작성일시(KST)·답변 전체 표시, 답변 등록순, 답변 0건이면 "아직 답변이 없습니다.", 없는 id·숫자가 아닌 id → 404 "존재하지 않는 질문입니다." + 목록 링크, 일반 사용자에게 답변 입력란 없음, 응답 어디에도 답변 담당자 사번 목록 없음 (FR-007, FR-012, FR-013, FR-015, NFR-SEC-005)
- [X] T037 [P] [US2] `tests/integration/filter-flow.test.js`: 서로 다른 프로그램 ID 질문 50건을 시드해 모든 필터 결과가 선택 ID와 100% 일치하는지(SC-003), 필터가 `WHERE program_id = ?` 열 조건 + `(program_id, id DESC)` 인덱스를 쓰는지 `EXPLAIN QUERY PLAN`으로 확인(검색 색인·LIKE 사용 안 함)
- [ ] T038 [P] [US2] (선택) `tests/integration/perf-seed.test.js`: 질문 10,000건 시드 후 목록·필터·상세 요청 각 50회의 p95가 2초 이내인지 확인 (NFR-PERF-001, NFR-PERF-003; 느린 환경을 위해 임계값은 환경변수 `PERF_READ_MS`로 조정 가능)

### Implementation for User Story 2

- [X] T039 [US2] `src/handlers/questions.js`의 `list` 확장: `program_id` 쿼리를 trim하여 비어 있으면 전체, 있으면 `WHERE program_id = ?`(정확 일치, 형식·미등록 검증 없이 그대로 질의해 0건이면 빈 목록), `page` 파싱(1 미만·비숫자는 1), `LIMIT 20 OFFSET`, 필터·페이지를 유지하는 링크. 필터는 검색 색인 없이 열 조건으로만 처리 (T035, T037, T038 통과)
- [X] T040 [US2] `src/handlers/questions.js`의 `detail` 확장: id 검증(양의 정수 아니면 404), 없는 질문 404 렌더링, 답변 등록 순서 조회 (T036 통과)
- [X] T041 [P] [US2] `src/views/question-list.js` 수정: 프로그램 ID 필터 입력란+"거르기" 버튼+"필터 해제" 링크(레이블 포함, 키보드 사용 가능), 빈 상태 문구 2종, 이전/다음 페이지 링크
- [X] T042 [P] [US2] `src/views/not-found.js`: "존재하지 않는 질문입니다." + 질문 목록으로 돌아가는 링크, 상태 404

**Checkpoint**: US1과 US2가 모두 독립적으로 동작하고 `npm test` 통과.

---

## Phase 5: User Story 3 - 지정된 담당자가 답변하기 (Priority: P3)

**Goal**: 사전에 지정된 사번의 답변 담당자만 답변을 등록하고, 그 외 로그인 사용자는 읽기만 한다. 권한은 서버가 검사한다.

**Independent Test**: 담당자는 답변이 등록되고, 비담당자의 직접 POST는 403으로 거부되어 저장이 0건이다.

### Tests for User Story 3 (먼저 작성, 실패 확인)

- [ ] T043 [P] [US3] `tests/contract/answers-create.test.js`: 계약 #8. 담당자 → 303 `/questions/:id`, 답변 수 +1, 작성일시 KST 표시, 여러 답변이 등록 순서로 표시. **비담당자가 화면을 거치지 않고 직접 POST** → 403 "답변 권한이 없습니다.", 답변 수 불변, DB 쓰기 없음(여러 비담당자 계정으로 반복, SC-004). 미로그인 POST → 401 "로그인이 필요합니다." 저장 없음. 없는 질문에 담당자가 POST → 404 "존재하지 않는 질문입니다." 저장 없음. 내용 공백 → 400 "답변 내용을 입력해 주세요.", 4,001자 → 400 "답변은 4,000자 이내로 입력해 주세요.". 같은 `form_token` 재전송 시 1건만. 검사 순서(401 → 403 → 404 → 400) 확인. 답변 담당자 목록에서 제거된 사용자의 새 답변은 거부되고 이전 답변은 유지. 로그에 `answer.create`/`auth.denied`가 `ref_id`·`user_id`만으로 기록되고 사번·이름·본문이 없음 (FR-010~013, FR-017, NFR-SEC-002, NFR-LOG)

### Implementation for User Story 3

- [ ] T044 [US3] `src/handlers/answers.js`: `POST /questions/:id/answers` — 로그인(401) → CSRF → `auth.isAnswerer()` 서버 검사(403, `auth.denied` 로그, DB 쓰기 없음) → 질문 존재(404) → `validate()` 공통 검증(400, 입력 유지) → `form_token` 중복 확인(이미 쓰였으면 기존 상세로 303) → 저장(`author_id`, `created_at`) → 303. 성공 시 `answer.create` 로그 (T043 통과, T023·T022 의존)
- [ ] T045 [P] [US3] `src/views/question-detail.js` 수정: 현재 사용자가 답변 담당자일 때만 답변 입력란(레이블, 오류 `aria-describedby`)과 등록 버튼을 렌더링(부가 처리이며 권한의 기준이 아님). 담당자 목록은 어떤 형태로도 출력하지 않음
- [ ] T046 [US3] `src/server.js` 라우팅 표에 계약 #8을 연결하고, 400 재렌더링 시 상세 화면과 질문·기존 답변이 함께 보이도록 `src/handlers/questions.js`의 상세 렌더링 함수를 재사용 (T044 의존)

**Checkpoint**: 세 스토리 모두 독립적으로 동작하고 `npm test` 전체 통과.

---

## Phase 6: Polish & Cross-Cutting

**Purpose**: 헌법·비기능 요구사항의 마지막 점검

- [ ] T047 [P] `tests/integration/no-external-requests.test.js`: `src/`, `public/`에 외부 URL(`https?://`, localhost 제외)이 없는지 검사, 모든 화면 응답의 `<link>`·`<script>`·`<img>` 참조가 같은 출처인지, CSP 헤더 존재 확인 (NFR-SEC-004, 헌법 V)
- [ ] T048 [P] `tests/integration/schema-and-scope.test.js`: 스키마에 태그·채택 열이 없고, 수정·삭제·내보내기 라우트가 없으며(404/405), 질문·답변 삭제 경로가 없음을 확인 (FR-006, FR-016, NFR-PRIV-001/002)
- [ ] T049 [P] `tests/contract/accessibility.test.js`: 모든 화면의 `<input>`/`<textarea>`에 대응 `<label for>`가 있고, 오류 문구가 `aria-describedby`로 연결되며 "오류:" 접두 텍스트가 있고, `<html lang="ko">`임을 마크업 수준에서 검사 (NFR-A11Y-001~003, NFR-L10N-001)
- [ ] T050 [P] `tests/integration/logging-privacy.test.js`: 질문 등록·답변·권한 거부·로그인 실패·잘못된 요청을 수행하며 캡처한 전체 stdout/stderr에 사번, 이름, 제목, 본문, 쿼리스트링 값이 한 번도 나오지 않음을 검증 (NFR-LOG-002, 헌법 III)
- [ ] T051 [P] (선택) `tests/integration/readonly-and-programs-unavailable.test.js`: `QNA_READONLY=1`에서 POST 503·GET 정상, `programs.json`이 없을 때 질문 등록 503(잘못된 ID 통과 없음)·읽기는 정상 (plan.md 위험 1, 되돌리기)
- [ ] T052 [P] `README.md` 갱신: 실행 방법, 환경변수, 관리자 CLI(사용자·답변 담당자), `data/programs.json` 편집 절차, 마이그레이션 up/down 및 down 사용 제한(운영 데이터 이후 금지·사전 백업), 배포 롤백 절차(plan.md "되돌리는 방법"), 실제 사내 배포 시 HTTPS 종단·쿠키 `Secure` 설정이 별도로 필요하다는 한 줄 안내(plan.md 위험 9)
- [ ] T053 헌법 점검 명령 실행 및 결과 기록: `grep -rnE "https?://" src public`, `grep -rniE "log.*(name|emp_no|empno|사번)" src`, `git diff main -- package.json`(의존성 항목 없음), `grep -rnP "[A-Za-z]{4,}" src/views`로 화면 템플릿의 영문 문구 확인, 외부 네트워크 차단 상태에서 서버 실행·주요 화면 로드. 결과를 PR 설명용 메모로 정리
- [ ] T054 `quickstart.md`의 수동 시나리오 전체와 성능 확인을 실행해 결과 확인(SC-001 시간 측정 포함), 불일치가 있으면 문서 또는 코드를 수정
- [ ] T055 `plan.md`의 요구사항 추적표와 실제 테스트 파일명이 일치하는지 대조하고 어긋난 항목을 수정
- [ ] T056 [P] (선택) `tests/integration/perf-write.test.js`: 질문 10,000건 시드 DB에서 `POST /questions`와 `POST /questions/:id/answers`(담당자 계정) 각 50회의 p95가 3초 이내인지 측정. 임계값은 환경변수 `PERF_WRITE_MS`로 조정 (NFR-PERF-002)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 의존 없음
- **Foundational (Phase 2)**: Setup 완료 후. **모든 스토리를 막는다.** 내부 순서: 테스트(T005~T012) → 구현(T013~T027). T016은 T014·T015 후, T021은 T020 후, T022는 T019·T021 후, T023은 T016 후, T024는 T017~T023 후, T025는 T024 후, T027은 T016·T023 후
- **US1 (Phase 3)**: Foundational 후 시작. 다른 스토리에 의존하지 않음(MVP)
- **US2 (Phase 4)**: Foundational 후 시작 가능. US1의 목록·상세 핸들러(T033, T034)를 확장하므로 같은 파일 수정 충돌을 피하려면 US1 이후 진행 권장
- **US3 (Phase 5)**: Foundational 후 시작 가능. 상세 화면(T034/T040)을 수정하므로 US2 이후 권장
- **Polish (Phase 6)**: 원하는 스토리가 모두 끝난 뒤

### Within Each Story

- 테스트 작성 → 실패(Red) 확인 → 구현 → 통과(Green) → 정리(Refactor)
- 테스트 커밋이 구현 커밋보다 앞서거나 같은 커밋에 있게 한다(헌법 I). 실패 확인 내용을 PR 설명에 적는다
- 검증은 항상 공통 `validate()`를 통과시키고, 문구는 `messages.js`에서만 가져온다

### Parallel Opportunities

- Setup: T002, T003, T004
- Foundational 테스트: T005~T012 전부 병렬(서로 다른 파일)
- Foundational 구현: T013, T014, T015, T017, T018, T019, T020, T026 병렬
- US1 테스트: T028, T029, T030 병렬 / 뷰: T032, T034 병렬
- US2 테스트: T035~T038 중 T035는 같은 파일(`questions-list.test.js`)을 T030과 공유하므로 T030 후 진행, 나머지(T036, T037, T038)는 병렬
- Polish 테스트: T047~T052, T056 병렬

### Parallel Example: User Story 1

```bash
# 테스트를 함께 작성 (서로 다른 파일)
Task: "tests/contract/questions-create.test.js 작성 (T028)"
Task: "tests/integration/duplicate-submit.test.js 작성 (T029)"
Task: "tests/contract/questions-list.test.js 기본 목록 부분 작성 (T030)"

# 구현 후반: 서로 다른 뷰 파일 병렬
Task: "src/views/question-form.js (T032)"
Task: "src/views/question-list.js, src/views/question-detail.js (T034)"
```

---

## Implementation Strategy

### MVP First (US1만)

1. Phase 1 Setup → Phase 2 Foundational (Foundational 테스트 통과 확인)
2. Phase 3 US1
3. **멈추고 검증**: `npm test`와 quickstart의 US1 시나리오. 이 시점에서 문의를 한곳에 모을 수 있다
4. 필요하면 시범 배포

### Incremental Delivery

1. Setup + Foundational → 기반 완성
2. US1 → 독립 검증 → (MVP)
3. US2 → 독립 검증 (필터·페이지)
4. US3 → 독립 검증 (답변·권한)
5. Polish → 헌법·비기능 점검

---

## Notes

- [P] = 다른 파일, 미완료 작업에 의존 없음
- 외부 패키지를 추가하고 싶어지면 먼저 `plan.md`에 사유(해결할 문제, 표준 기능으로 부족한 이유, 대안)를 적고 승인을 받는다(헌법 II)
- 로그에는 `event, at, result, ref_id, user_id`만. 이름·사번·제목·본문·쿼리스트링 금지(헌법 III)
- SC-006, SC-007은 운영 지표라 구현 작업이 없고 도입 후 집계로 확인한다
- 작업 하나 또는 논리적 묶음마다 커밋하고 체크포인트마다 멈추어 독립 검증한다
