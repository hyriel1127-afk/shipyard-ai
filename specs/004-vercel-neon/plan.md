# Implementation Plan: Vercel 배포 및 Neon(Postgres) 전환

**Branch**: `004-vercel-neon` | **Date**: 2026-11-13

## 요약

사내 단일 프로세스(Node http 서버 + SQLite 파일)로 동작하던 게시판을 Vercel 서버리스 함수 + Neon Postgres 구조로 바꾼다.
화면, 라우트, 검증, 오류 문구, 로그 규칙은 바꾸지 않는다. 바뀌는 것은 데이터 접근 계층(동기 SQLite → 비동기 Postgres)과 배포 진입점이다.

## 왜 바꾸는가

- Vercel 함수의 파일시스템은 읽기 전용이거나 호출 사이에 유지되지 않아 SQLite 파일 DB를 쓸 수 없다.
- 세션은 이미 DB(`sessions` 테이블)에 있어 서버리스에서도 동작한다. 그 밖의 서버 메모리 상태는 없다.

## 헌법 점검

| 원칙 | 영향 | 처리 |
|------|------|------|
| I. API 테스트 우선 | 라우트 동작은 그대로. 데이터 계층 교체 | 기존 계약 테스트를 PGlite 위에서 그대로 통과시켜 회귀를 막는다. 새 동작(Secure 쿠키, 배포 설정)은 `tests/unit/deploy-config.test.js`로 먼저 고정 |
| II. 최소 외부 패키지 | 패키지 2개 추가 | 아래 "패키지 추가 사유". 헌법 v2.0.0에 명시 |
| III. 개인정보 로그 금지 | 영향 없음 | DB 오류는 고정 문구만 출력. `DATABASE_URL`은 어디에도 출력하지 않는다 |
| IV. 한국어·KST | 영향 없음 | 시각은 BIGINT(epoch ms)로 저장하고 표시 때 `formatKst`를 거친다(기존과 동일) |
| V. 외부 서비스 | **개정 필요** | "사내망 전용"을 "허용된 외부 서비스(Vercel, Neon)만, CDN 금지"로 개정(v2.0.0, MAJOR) |

## 패키지 추가 사유 (원칙 II)

### `@neondatabase/serverless` (운영)

- **해결하는 문제**: Vercel 서버리스에서 Neon Postgres에 접속한다.
- **표준 기능·직접 구현으로 부족한 이유**: Node에는 내장 Postgres 클라이언트가 없다. Postgres 와이어 프로토콜을 직접 구현하는 것은 보안·유지보수 부담이 과하다.
- **검토한 대안**: `pg`(node-postgres) — TCP 연결 풀을 서버리스에서 직접 관리해야 해 연결 고갈 위험이 크다. Neon 공식 권장 드라이버가 서버리스에 맞다.

### `@electric-sql/pglite` (개발 전용)

- **해결하는 문제**: 로컬·CI에서 Neon 계정이나 Docker 없이 같은 SQL·마이그레이션을 검증한다.
- **이유**: 테스트 171건의 대부분이 DB를 쓴다. 외부 DB를 필수로 하면 테스트가 네트워크와 비밀값에 묶인다.
- **제한**: 운영 코드(`src/`, `api/`, `scripts/`)는 불러오지 않는다(`tests/unit/deploy-config.test.js` 및 `snapshot-no-network.test.js`가 의존성 구성을 확인).
- **검토한 대안**: 테스트마다 Neon 브랜치 사용 — 느리고 비밀값이 필요. 실제 Neon 접속 시험은 `TEST_DATABASE_URL`이 있을 때만 도는 선택 시험으로 둔다.

## 구조 변경

| 영역 | 변경 |
|------|------|
| `src/db.js` | `node:sqlite` 제거. `connectNeon(url)`이 `all/get/run/exec/tx/close`(async)를 가진 Db를 돌려준다. 자리표시자는 `$1…` |
| `src/migrations/001_init.*.sql` | Postgres 문법. `id`는 IDENTITY, 시각은 `BIGINT`, 프로그램 ID 형식은 정규식 `CHECK`, 길이는 `char_length` |
| `src/server.js` | `createHandler({db, cfg, programs})`(요청 처리기)와 `createApp`(로컬 http 서버)으로 분리. 마이그레이션 자동 실행은 로컬 `npm start`에서만 |
| `api/index.js`, `vercel.json` | 모든 경로를 한 함수로 rewrite. `public/`, `data/programs.json`, `src/migrations/`를 함수에 포함 |
| `src/config.js` | `DATABASE_URL`, `secureCookie`(Vercel/`QNA_SECURE_COOKIE=1`). Vercel에서는 테스트 로그인(`QNA_DEV_LOGIN`)이 켜지지 않는다 |
| `src/auth.js` | 비동기화. 세션 쿠키에 `Secure` 옵션 |
| `src/snapshot.js`, `src/review-report.js` | Db를 받아 조회. 스냅샷은 `REPEATABLE READ, READ ONLY` 트랜잭션 하나로 한 시점만 읽는다 |
| `scripts/*` | `DATABASE_URL` 기준. `.env`는 `src/env.js`가 Node 내장 `process.loadEnvFile`로 읽는다(패키지 없음) |

## 배포 모델

- DB 스키마 변경은 배포와 분리해 `npm run migrate`로 사람이 실행한다(함수가 동시에 여러 개 떠도 안전). `api/index.js`는 마이그레이션을 실행하지 않는다.
- 프로그램 ID 목록(`data/programs.json`)은 배포 파일이다. 바꾸려면 저장소에서 수정하고 다시 배포한다(서버리스에서는 런타임 파일 수정이 반영되지 않음).
- 접속 정보는 Vercel 환경변수 `DATABASE_URL`(Neon 풀러 주소)로만 준다.

## 범위 밖 / 한계

- 기존 SQLite 데이터를 Neon으로 옮기는 스크립트는 만들지 않았다. 옮길 운영 데이터가 있으면 별도 작업이 필요하다.
- 실제 Neon 접속은 이 저장소의 자동 시험으로 검증하지 않았다(접속 정보 없음). `TEST_DATABASE_URL`을 주면 CLI·MCP 접속 시험이 실행된다.
- 로그인 잠금, 서명 토큰 등은 기존대로 범위 밖이다.
