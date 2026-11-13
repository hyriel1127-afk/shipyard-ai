# Implementation Plan: 사내 프로그램 문의 QnA 게시판

**Branch**: `001-qna-board` | **Date**: 2026-11-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-qna-board/spec.md`

## Summary

로그인한 직원이 프로그램 ID를 붙여 질문을 올리고, 프로그램 ID로 목록을 거르며, 사전에 지정된
사번의 답변 담당자만 답변을 쓰는 사내 게시판. 서버가 HTML을 렌더링하는 단일 Node.js 서비스로
만들고, **외부 npm 패키지를 하나도 쓰지 않는다**(Node 내장 `node:http`, `node:sqlite`,
`node:crypto`, `node:test`). 저장소는 SQLite 파일 하나이다. 모든 엔드포인트는 계약 테스트를
먼저 작성한다(헌법 I). 상세 결정 근거는 [research.md](./research.md).

## Technical Context

**Language/Version**: Node.js 24 LTS 이상 (`node:sqlite` 내장 사용; 개발 환경 v26), JavaScript(ESM), 빌드 단계 없음

**Primary Dependencies**: 없음 (런타임·개발 모두 Node 내장 모듈만 사용 → 헌법 II 충족, 추가 사유 기록 대상 없음)

**Storage**: SQLite 단일 파일(`node:sqlite`), WAL 모드. 질문·답변·사용자 영구 보관(삭제 기능 없음)

**Testing**: `node --test` (`node:test` + `node:assert`). 계약 테스트는 임시 DB와 임의 포트로 서버를 띄워 실제 HTTP로 호출

**Target Platform**: 사내망의 Windows/Linux 서버 1대, 브라우저는 사내 표준 최신 브라우저

**Project Type**: web-service (서버 렌더링 HTML + 폼 POST, 별도 SPA 없음)

**Performance Goals**: 목록·상세 p95 ≤ 2초, 등록 p95 ≤ 3초 (동시 100명, 질문 10,000건 — NFR-PERF)

**Constraints**: 로그인 화면(`/login`)과 정적 스타일(`/static/style.css`)만 인증 예외(NFR-SEC-001), 외부 호스트 요청 0건(CDN·웹폰트·아이콘 없음), 로그에 이름·사번·본문 금지, 화면 문구 한국어, 시각 KST 표시

**Scale/Scope**: 화면 4개(로그인, 질문 목록, 질문 작성, 질문 상세+답변), 엔드포인트 8개, 테이블 5개

**프로그램 ID 설계 요약**: `questions.program_id`는 `NOT NULL` + 빈 문자열 금지 CHECK. 유효 ID 목록은 `data/programs.json`이 유일한 원천이며, 서버가 질문 등록 요청마다 이 목록으로 검증한다(화면의 선택 목록 제한과 별개). 실패 시 `400` + 한국어 문구. 프로그램 ID 필터는 검색 색인 없이 `WHERE program_id = ?` 열 조건(+ B-tree 인덱스)으로 처리한다.

**검증 라이브러리**: 앞선 계획 단계에서 검증 라이브러리를 정한 적이 없고 외부 패키지는 0개로 확정되어 있다(헌법 II). 따라서 "이미 정한 것"은 `src/validation.js`(자체 구현, 패키지 아님)이며, 새 라이브러리는 추가하지 않는다. 모든 POST 요청은 이 모듈의 공통 함수 `validate(schema, input, ctx)` 하나를 거친다.

## Constitution Check

*GATE: Phase 0 이전 통과 필요. Phase 1 설계 후 재확인.*

| 원칙 | 판정 | 근거 / 이행 방법 |
|------|------|------------------|
| I. API 테스트 우선 | 통과 | `tests/contract/`에 엔드포인트별 성공·검증 실패·권한 오류 테스트를 구현보다 먼저 작성한다. tasks.md에서 테스트 작업을 구현 작업 앞에 배치한다 |
| II. 최소 외부 패키지 | 통과 | 외부 패키지 0개. `package.json`에 `dependencies`/`devDependencies`를 두지 않는다 |
| III. 개인정보 로그 금지 | 통과 | 로거는 허용 필드(`event`, `at`, `result`, `ref_id`, `user_id`)만 받는 함수 하나로 제한. 요청·응답 본문, 이름, 사번은 로거에 전달하지 않음. 로그 캡처 테스트 포함 |
| IV. 한국어/KST | 통과 | 모든 문구는 `src/messages.js` 한 곳에 한국어로 모음. 시각은 공용 `formatKst()`(`Intl`, `Asia/Seoul`)만 사용. UTC 경계 테스트 포함 |
| V. 사내망 전용 | 통과 | 정적 자원(CSS)은 저장소 포함, 시스템 글꼴 사용. CSP `default-src 'self'` 헤더로 외부 로드 차단. 외부 URL grep 검사를 테스트에 포함 |

**설계 후 재확인(Phase 1 완료)**: 위 판정 유지. 위반 없음 → Complexity Tracking 비움.

## Project Structure

### Documentation (this feature)

```text
specs/001-qna-board/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── http-endpoints.md
└── tasks.md             # /speckit-tasks 가 생성
```

### Source Code (repository root)

```text
package.json             # 의존성 없음, scripts: start, test, admin
src/
├── server.js            # http 서버 기동, 라우팅 표
├── config.js            # 포트·바인드 주소·DB 경로(환경변수)
├── db.js                # SQLite 연결, 마이그레이션 실행
├── migrations/
│   ├── 001_init.up.sql
│   └── 001_init.down.sql
├── programs.js          # data/programs.json 로드(mtime 변경 시 재로드), has(id)
├── auth.js              # scrypt 해시 검증, 세션, CSRF 토큰
├── logger.js            # 허용 필드만 기록하는 구조화 로그
├── messages.js          # 한국어 문구 모음
├── time.js              # formatKst()
├── validation.js        # 공통 검증 validate(schema, input, ctx): 모든 POST가 경유, 실패 시 400
├── html.js              # escape + 템플릿 헬퍼
├── handlers/
│   ├── login.js
│   ├── questions.js     # 목록, 작성, 상세
│   └── answers.js
└── views/               # 서버 렌더링 템플릿(JS 함수)
data/
└── programs.json        # 유효 프로그램 ID 목록(["PRGM0001", ...]), 시스템 관리자가 운영 절차로 편집
public/
└── style.css            # 자체 호스팅 스타일
scripts/
├── admin.js             # 사용자·답변 담당자 관리 CLI (운영 절차)
└── migrate.js           # up / down 실행
tests/
├── contract/            # 엔드포인트별 계약 테스트 (먼저 작성)
│   ├── auth.test.js
│   ├── questions-create.test.js
│   ├── questions-list.test.js         # 기본 목록(필터 없음)
│   ├── questions-list-filter.test.js  # 프로그램 ID 필터·페이지·빈 상태
│   ├── questions-create-direct.test.js # 화면을 거치지 않은 직접 POST 검증
│   ├── public-read.test.js            # 읽기 공개(미로그인 GET)
│   ├── question-detail.test.js
│   ├── answers-create.test.js
│   └── accessibility.test.js
├── integration/         # 작성됨: duplicate-submit, filter-flow, migration-roundtrip,
│                        # no-external-requests, schema-and-scope, logging-privacy
│                        # 선택(미작성): perf-seed, perf-write, readonly-and-programs-unavailable
└── unit/                # validation, programs-file, time, logger, html-escape
```

**Structure Decision**: 단일 프로젝트. 프런트엔드를 따로 두지 않고 서버가 HTML을 렌더링하여
빌드 도구와 패키지를 없앤다. 엔드포인트 계약은
[contracts/http-endpoints.md](./contracts/http-endpoints.md)에 고정한다.

## 프로그램 ID 설계 상세

- **저장**: `questions.program_id TEXT NOT NULL CHECK (length(program_id) > 0 AND program_id GLOB ...)`. FK는 두지 않는다(목록이 DB가 아니라 파일이므로). DB CHECK는 마지막 방어선이고, 의미 있는 검증(미등록 여부)은 서버 공통 검증이 맡는다.
- **목록 파일**: `data/programs.json`은 문자열 배열. 서버는 요청 시 파일 mtime을 확인해 바뀌었을 때만 다시 읽는다(재시작 불필요). 파일이 없거나 JSON이 깨졌으면 **마지막 정상 목록을 유지**하고 오류 이벤트(`programs.load_failed`)를 로그에 남기며, 최초 로드부터 실패하면 모든 질문 등록을 `400`이 아닌 `503`으로 거부해 "잘못된 ID가 통과"하는 일을 막는다(fail closed).
- **서버 검증(필수)**: `POST /questions`는 화면에 선택 목록이 있든 없든 `validate()`에서 trim → 누락 → 형식 → `programs.has()` 순으로 검사한다. 화면은 `<input list>`로 허용 ID를 제안만 하고 제한하지 않는다(직접 요청과 동일 규칙 적용).
- **실패 응답**: 모든 검증 실패는 `400` + 같은 폼을 한국어 오류 문구와 함께 다시 렌더링(입력 유지).
- **조회**: `GET /?program_id=PRGM0001`은 `WHERE program_id = ? ORDER BY id DESC LIMIT 20 OFFSET ?`. 검색 색인(FTS 등)은 만들지 않으며, `(program_id, id DESC)` 인덱스로 처리한다.

## 요구사항 추적표 (명세 → 설계 → 테스트)

테스트 경로는 `tests/` 기준. "계약"은 `contracts/http-endpoints.md`의 번호.

### 기능 요구사항 (FR)

| ID | 담당 설계 | 검증 테스트 |
|----|-----------|-------------|
| FR-001 | 계약 #5·#6, `handlers/questions.js`, `questions` 테이블 | contract/questions-create (로그인 사용자 성공) |
| FR-002 | `questions.program_id NOT NULL`, `validate()` 단일 값 검사 | contract/questions-create (누락·다중 값 400) |
| FR-003 | `validate()` 누락 규칙, `messages.PROGRAM_ID_REQUIRED` | unit/validation, contract/questions-create |
| FR-004 | `validate()` 정규식 규칙(대소문자 구분) | unit/validation (경계: 8자·9자·소문자·`prg 1`), contract/questions-create |
| FR-005 | `programs.js` + `data/programs.json`, 서버 측 `has()` 검증 | unit/programs-file, contract/questions-create (`PRGM9999` 400) |
| FR-006 | 스키마에 태그 열·입력란 없음 | contract/questions-create (태그 필드 무시), integration/schema-and-scope |
| FR-007 | views: 목록 행·상세 헤더에 program_id 출력 | contract/questions-list, contract/question-detail |
| FR-008 | 계약 #4 `program_id` 열 조건 + `(program_id, id DESC)` 인덱스, 필터 해제 링크 | contract/questions-list-filter, integration/filter-flow |
| FR-009 | `ORDER BY id DESC LIMIT 20 OFFSET`, `page` 쿼리 | contract/questions-list-filter (21건 시 2페이지) |
| FR-010 | `answerers` 테이블, `auth.isAnswerer()` | contract/answers-create (담당자 성공) |
| FR-011 | 핸들러 첫 단계에서 서버 검사(화면 의존 없음) | contract/answers-create (직접 POST 403, 저장 0건) |
| FR-012 | 답변 폼은 담당자에게만 렌더링, 읽기 경로는 공통 | contract/question-detail (일반 사용자 폼 없음) |
| FR-013 | `answers` `(question_id, id ASC)` 인덱스 | contract/question-detail (등록순 표시) |
| FR-014 | `auth.require()` 미들웨어, 계약 공통 401 | contract/auth (전 엔드포인트 미로그인 401) |
| FR-015 | 404 응답 + 목록 링크 | contract/question-detail, contract/answers-create |
| FR-016 | 스키마·화면에 채택 없음 | integration/schema-and-scope |
| FR-017 | `author_id`, `created_at` 저장 | contract/questions-create, contract/answers-create |
| FR-018 | 400 시 입력값 되돌려 렌더링 | contract/questions-create (제목·내용 유지) |

### 성공 기준 (SC)

| ID | 담당 설계 | 검증 |
|----|-----------|------|
| SC-001 | 단일 폼, 입력 제안(`datalist`), 오류 시 입력 유지 | quickstart 수동 시나리오(시간 측정) |
| SC-002 | 오류 문구가 입력란과 연결, 레이블 명확 | 사용성 확인(운영 후 측정), quickstart |
| SC-003 | 열 조건 정확 일치 필터 | integration/filter-flow (결과 100% 일치) |
| SC-004 | FR-011 서버 검사 | contract/answers-create (여러 비담당자 케이스 저장 0건) |
| SC-005 | 공통 `validate()` | contract/questions-create (3종 오류 각각 400·문구·미저장) |
| SC-006 | 운영 지표(범위 밖 측정) | 도입 전후 집계 — 자동 테스트 없음 |
| SC-007 | 운영 지표 | 도입 후 집계 — 자동 테스트 없음 |

### 비기능 요구사항 (NFR)

| ID | 담당 설계 | 검증 |
|----|-----------|------|
| NFR-SEC-001 | `auth.require()` 전 라우트 적용 | contract/auth |
| NFR-SEC-002 | 서버 권한 검사 | contract/answers-create |
| NFR-SEC-003 | `html.js` `esc()` 태그드 템플릿 | unit/html-escape, integration (스크립트 문자열 글자 그대로) |
| NFR-SEC-004 | CSP, 자체 호스팅 CSS | integration/no-external-requests |
| NFR-SEC-005 | 답변 담당자 목록 비노출 | contract/question-detail (응답에 목록 없음) |
| NFR-PERF-001, 003 | 인덱스, 그룹 집계 | integration/perf-seed (10,000건, 읽기) |
| NFR-PERF-002 | 짧은 쓰기 트랜잭션, WAL | integration/perf-write (10,000건 DB에서 등록 p95 3초) |
| NFR-A11Y-001~003 | 시맨틱 HTML, label, `aria-describedby`, 팔레트 | contract/accessibility + quickstart 수동 |
| NFR-LOG-001~002 | `logger.js` 허용 필드, `auth.required` 기록 | unit/logger, integration/logging-privacy, contract/auth |
| NFR-PRIV-001~002 | 삭제 기능·내보내기 없음 | integration/schema-and-scope |
| NFR-L10N-001~002 | `messages.js`, `formatKst()` | unit/time (UTC 15:30 → 00:30 다음 날) |

## 위험과 되돌리는 방법

### 위험

| # | 위험 | 영향 | 대응 |
|---|------|------|------|
| 1 | `data/programs.json` 손상·삭제 | 질문 등록 불가 또는 잘못된 ID 통과 | 마지막 정상 목록 유지, 최초 로드 실패 시 `503`으로 fail closed, 로드 실패 로그, 파일을 Git으로 버전 관리. 검증: integration/readonly-and-programs-unavailable |
| 2 | 목록에서 ID를 제거 | 기존 질문은 남지만 해당 ID로 새 질문 불가, 필터는 여전히 동작 | 기존 질문의 `program_id`는 변경하지 않음(영구 보관). 제거는 운영 절차 문서화 |
| 3 | 파일 목록과 DB 값 불일치 | 존재하지 않는 ID의 기존 질문 | FK를 두지 않는 대신 DB CHECK로 형식만 보장, 의미 검증은 등록 시점에만 |
| 4 | 마이그레이션 중 데이터 손실 | 질문·답변 소실 | 적용 전 DB 파일 백업 필수, 마이그레이션은 트랜잭션으로 실행 |
| 5 | 자체 검증·인증 코드 결함 | 권한·입력 검증 우회 | 헌법 I(테스트 우선), 공통 `validate()` 단일 경로, 계약 테스트로 거부 사례 증명 |
| 6 | SQLite 단일 쓰기 병목 | 동시 100명 초과 시 지연 | WAL 모드, 쓰기 트랜잭션 짧게 유지, perf-seed 테스트로 확인 |
| 7 | `node:sqlite` API 변경 | 업그레이드 시 깨짐 | Node 버전을 `engines`와 `.nvmrc`로 고정, 접근을 `db.js` 한 곳에 격리 |
| 8 | 자체 로그인 도입 | 비밀번호 관리 부담, 후속 SSO 전환 | `auth.js` 경계 + 내부 `user_id` 식별 |
| 9 | 운영용 보안 항목 미적용(HTTPS 종단·쿠키 `Secure`, 로그인 잠금, 서명 토큰) | 실제 사내 운영에는 부족 | 강의 과제 제출용이라 범위 밖. 배포 시에는 사내 HTTPS 종단과 쿠키 `Secure` 설정을 별도 도입해야 한다고 README에 한 줄 명시 |

### 되돌리는 방법

- **마이그레이션 up/down**: `src/migrations/001_init.up.sql`이 5개 테이블과 인덱스를 만들고, `001_init.down.sql`이 의존 순서의 역순으로 `DROP TABLE`(`answers` → `questions` → `sessions` → `answerers` → `users`)과 인덱스 제거를 수행한다. `scripts/migrate.js up|down`으로 실행하고 적용 이력은 `schema_migrations` 테이블에 기록한다. `integration/migration-roundtrip` 테스트가 up → down → up이 오류 없이 되는지 검증한다.
- **데이터가 있는 DB에서 down 실행 시 질문·답변이 삭제된다.** 영구 보관 원칙(NFR-PRIV-001)상 down은 개발·초기 배포 직후에만 쓰고, 운영 데이터가 쌓인 뒤에는 down 대신 새 마이그레이션(앞으로 고치기)으로 처리한다. 실행 전 DB 파일 복사본을 만든다.
- **배포 롤백**: 코드는 이전 태그로 되돌리고, DB는 배포 전 백업 파일로 복원한다. 스키마 변경이 없는 배포는 코드만 되돌린다.
- **`programs.json` 변경 롤백**: Git으로 이전 버전을 복원하면 mtime 변경으로 즉시 반영된다.
- **기능 단위 차단**: 장애 시 `POST` 라우트만 막는 읽기 전용 모드(`QNA_READONLY=1`)를 둔다. 읽기는 유지되고 쓰기는 `503`.

## Complexity Tracking

위반 없음.
