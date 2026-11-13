---

description: "QnA 스냅샷 내보내기 구현 작업 목록"
---

# Tasks: QnA 게시판 읽기 전용 스냅샷 내보내기

**Input**: `/specs/003-qna-snapshot/`의 plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Prerequisites**: plan.md, spec.md (모두 있음)

**Tests**: 포함한다. 헌법 I(테스트 우선)에 따라 각 스토리의 테스트를 먼저 쓰고 **실패를 확인한 뒤** 구현한다. 실행 명령은 `npm test`(= `node --test`).

**Organization**: 사용자 스토리별로 묶는다. 네 스토리가 모두 `src/snapshot.js` 한 파일을 키우므로 스토리 간 구현 작업은 `[P]`가 아니라 순서대로 진행한다(테스트 파일 작성만 병렬 가능).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 서로 다른 파일이고 미완료 작업에 의존하지 않아 병렬 가능
- **[Story]**: 해당 사용자 스토리 (US1~US4)

## Path Conventions

- 단일 프로젝트: 저장소 루트의 `src/`, `scripts/`, `tests/`
- 외부 패키지는 추가하지 않는다(헌법 II). `package.json`은 `scripts.snapshot` 한 줄만 추가한다.

---

## Phase 1: Setup

**Purpose**: 설정, 실행 진입점 자리, 테스트 도우미 준비

- [X] T001 `src/config.js`의 `loadConfig`에 `snapshotPath: env.QNA_SNAPSHOT_PATH ?? './data/snapshot/qna.md'` 한 줄을 추가한다(기존 필드는 그대로 둔다).
- [X] T002 `package.json`의 `scripts`에 `"snapshot": "node scripts/export-snapshot.js"`를 추가한다(`dependencies`, `devDependencies`는 만들지 않는다).
- [X] T003 [P] 테스트 도우미 `tests/helpers/snapshot-db.js`를 만든다. `makeSnapshotFixture()`는 임시 폴더를 만들고, 그 안의 **파일 DB**(읽기 전용 연결은 `:memory:`로는 검증할 수 없다)를 `openDb()`+`migrate(db,'up')`로 준비한 뒤 `{ dir, dbPath, outPath, addUser(empNo,name), addQuestion({programId,title,body,createdAt,authorId}), addAnswer({questionId,body,createdAt,authorId}), cleanup() }`를 돌려준다. `outPath`는 `<dir>/snapshot/qna.md`(폴더는 만들지 않는다). 제목 1~100자, 본문 1~4000자 CHECK 제약을 지킨다.

---

## Phase 2: Foundational

**Purpose**: 모든 스토리가 공유하는 출력 형식 뼈대

**⚠️ CRITICAL**: 이 단계가 끝나야 스토리 구현을 시작한다.

- [X] T004 [P] `tests/unit/snapshot-format.test.js`에 `renderSnapshot(questions, answersByQuestion, nowMs)`(순수 함수) 단위 테스트를 먼저 쓴다. `contracts/snapshot-file.md` 기준으로 다음을 검증한다: 첫 줄 `생성 시각: YYYY-MM-DD HH:mm KST`, 빈 줄 1개 뒤 `# QnA 스냅샷`, 질문마다 `## 질문 <번호>`와 `- 프로그램 ID:`, `- 질문 등록일:`, `- 제목:`, `- 본문:`, 제목·본문의 모든 줄 앞 `> `(빈 줄은 `>`), 답변 `### 답변 N`과 `- 답변 등록일:`, 답변이 없으면 `### 답변 없음`, 질문 0건이면 첫 줄 `생성 시각:` + 빈 줄 + `내보낼 질문이 없습니다`만 있고 `# QnA 스냅샷`·질문 항목이 없음. 실행해 **실패(모듈 없음)를 확인**한다.
- [X] T005 `src/snapshot.js`를 새로 만들고 `renderSnapshot`만 구현한다. 시각은 `src/time.js`의 `formatKst()`로 표시하고(직접 날짜 포맷 금지), 본문 줄 분리는 `\r\n`과 `\n`을 모두 처리한다. T004가 통과해야 한다.

**Checkpoint**: 출력 형식이 단위 테스트로 고정됨.

---

## Phase 3: User Story 1 - 질문과 답변을 한 파일로 내보내기 (Priority: P1) 🎯 MVP

**Goal**: 질문과 답변 전체를 `data/snapshot/qna.md` 한 파일로 쓴다(FR-001~004, FR-011).

**Independent Test**: 질문·답변이 있는 파일 DB로 `exportSnapshot`을 호출하고, 출력 파일의 질문 수·답변 수·순서·내용을 확인한다.

### Tests for User Story 1 ⚠️ 먼저 작성하고 실패 확인

- [X] T006 [P] [US1] `tests/integration/snapshot-export.test.js`를 만든다. 케이스: (a) 질문 3건·답변이 섞인 DB에서 `## 질문 ` 개수가 질문 수와 같고 `### 답변 ` 개수가 답변 수와 같다(SC-001), (b) 질문은 번호 오름차순, 한 질문의 여러 답변은 등록 순(spec US1-4), (c) 답변 없는 질문에 `### 답변 없음`이 있다(US1-3), (d) 본문에 `## 질문 99`, `---`, 코드 펜스, 이모지, 4000자 본문이 있어도 `^## 질문 ` 줄 수가 질문 수와 같고 원문이 보존된다(FR-013, Edge Cases), (e) 이미 있는 `qna.md`를 새 내용으로 완전히 대체한다(US1-5), (f) 같은 DB로 두 번 내보내면 `생성 시각:` 줄을 뺀 내용이 같다(SC-008). 실행해 **실패를 확인**한다.

### Implementation for User Story 1

- [X] T007 [US1] `src/snapshot.js`에 `exportSnapshot({ dbPath, outPath, now = Date.now() })`를 구현한다. `new DatabaseSync(dbPath, { readOnly: true })`로 열고, `questions`는 `SELECT id, program_id, title, body, created_at FROM questions ORDER BY id ASC`, `answers`는 `SELECT question_id, body, created_at FROM answers ORDER BY id ASC`로 읽어 `renderSnapshot`에 넘긴다(컬럼을 명시하고 `SELECT *`는 쓰지 않는다). 쓰기는 `fs.mkdirSync(dirname, {recursive:true})` 후 같은 폴더에 `qna.md.tmp-<pid>`로 쓰고 `fs.renameSync`로 교체한다. `{ questions: n, answers: m }`을 반환한다. T006이 통과해야 한다.
- [X] T008 [US1] `scripts/export-snapshot.js`를 만든다. `loadConfig()`의 `dbPath`, `snapshotPath`로 `exportSnapshot`을 호출하고 성공 시 `스냅샷을 만들었습니다. 질문 N건, 답변 M건`을 출력한다. (오류 처리는 US4에서 완성한다.)

**Checkpoint**: `npm run snapshot`으로 스냅샷 파일이 만들어진다. 이것이 MVP다.

---

## Phase 4: User Story 2 - 개인정보 제외와 생성 시각 표시 (Priority: P1)

**Goal**: 사번·이름이 파일 어디에도 없고, 모든 시각이 KST다(FR-005~007, FR-014).

**Independent Test**: 작성자 이름·사번이 알려진 데이터로 내보낸 뒤 파일 전체에서 그 값이 검색되지 않고, UTC 경계 시각이 KST로 표시되는지 확인한다.

### Tests for User Story 2 ⚠️ 먼저 작성하고 실패 확인

- [X] T009 [P] [US2] `tests/integration/snapshot-privacy.test.js`를 만든다. 질문 작성자(사번 `EMP7001`, 이름 `비밀작성자가`)와 답변 작성자(사번 `EMP7002`, 이름 `비밀작성자나`)로 데이터를 만들고, 출력 파일 전체에서 네 값이 모두 0건임을 검증한다(SC-002). 이 질문·답변의 제목·본문에는 위 네 값을 쓰지 않는다. 별도 질문 하나의 제목·본문에는 작성자 값과 **다른** 문자열(예: `홍길동님께 문의`)을 넣고 원문이 **그대로** 나오는지 확인한다(가공하지 않음, spec US2-2). `src/snapshot.js` 소스에 `author_id`, `users`, `emp_no`, `name` 조회가 없는지 파일 내용 검사도 한다.
- [X] T010 [P] [US2] `tests/integration/snapshot-kst.test.js`를 만든다. 질문·답변 등록일을 `2026-11-12T14:59:59Z`(KST 23:59:59 → 같은 날)와 `2026-11-12T15:00:00Z`(KST 다음 날 00:00)로 두고 `YYYY-MM-DD HH:mm`이 KST로 나오는지, `now`를 같은 경계로 준 `생성 시각:` 줄도 `... KST`로 맞는지 검증한다(spec US2-3~5, 헌법 IV). 실행해 **실패를 확인**한다.

### Implementation for User Story 2

- [X] T011 [US2] T009·T010을 통과시킨다. US1 구현이 이미 컬럼을 명시했고 `formatKst()`를 쓰므로 대부분 통과해야 하며, 실패하는 부분만 `src/snapshot.js`에서 고친다(통과하면 코드 변경 없이 테스트만 확정한다).

**Checkpoint**: 개인정보 제외와 KST 표시가 테스트로 고정됨.

---

## Phase 5: User Story 3 - 데이터를 바꾸지 않는 안전한 내보내기 (Priority: P1)

**Goal**: 실행 전후 DB가 완전히 같다(FR-008, FR-014 일부).

**Independent Test**: 실행 전후 모든 테이블 내용을 비교한다. 읽기 전용 연결로 쓰기가 거부되는지 확인한다.

### Tests for User Story 3 ⚠️ 먼저 작성하고 실패 확인

- [X] T012 [P] [US3] `tests/integration/snapshot-readonly.test.js`를 만든다. (a) 내보내기 전후로 `users`, `answerers`, `questions`, `answers`, `sessions`, `schema_migrations`의 전체 행을 읽어 `deepEqual`로 비교한다(SC-003). (b) 실행 전후 DB 메인 파일의 크기와 내용 해시(`node:crypto`)가 동일하다. 읽기 전용 연결이 WAL 보조 파일(`-wal`, `-shm`)을 만들 수는 있으므로(구현 중 확인) 새로 생긴 `-wal`은 크기 0이어야 한다. 수정 시각은 비교하지 않는다. (c) 마이그레이션이 적용되지 않은 빈 파일 DB를 주면 스키마가 생기지 않고 실패한다. (d) 출력 경로의 부모가 **파일**이라 폴더를 만들 수 없어 쓰기에 실패해도 DB 내용은 같다(spec US3-2, 권한 변경에 의존하지 않아 Windows에서도 재현된다). 실행해 **실패를 확인**한다.
- [X] T013 [P] [US3] `tests/integration/snapshot-consistency.test.js`를 만든다. 질문 조회와 답변 조회 사이에 별도 연결로 새 질문·답변을 삽입하는 시나리오로, 파일의 질문·답변이 한 시점의 것이며(질문 없이 답변만 있거나 그 반대가 없음) 서로 어긋나지 않음을 확인한다. 이를 위해 `exportSnapshot`이 조회 사이에 호출하는 내부 훅(`opts.afterQuestionsRead`, 테스트 전용 선택 인자)을 사용한다.

### Implementation for User Story 3

- [X] T014 [US3] `src/snapshot.js`의 `exportSnapshot`에서 질문·답변 조회를 `BEGIN` … `COMMIT`(오류 시 `ROLLBACK`) 한 트랜잭션으로 묶고, 연결은 `finally`에서 반드시 닫는다. `opts.afterQuestionsRead`가 있으면 질문 조회 직후 호출한다. `openDb()`·`migrate()`를 import하지 않는다. T012·T013이 통과해야 한다.

**Checkpoint**: DB 불변과 일관성이 테스트로 고정됨.

---

## Phase 6: User Story 4 - 질문이 없거나 저장 폴더가 없는 경우 (Priority: P2)

**Goal**: 빈 상태와 폴더 없음을 정상 처리하고, 실패 시 이전 스냅샷을 보존한다(FR-009, FR-010, FR-012, FR-015).

**Independent Test**: 질문 0건 DB, 폴더 없음, DB 없음, 쓰기 불가 각각에서 명령 결과를 확인한다.

### Tests for User Story 4 ⚠️ 먼저 작성하고 실패 확인

- [X] T015 [P] [US4] `tests/integration/snapshot-failures.test.js`를 만든다. (a) 질문 0건이면 출력이 정확히 `생성 시각: ... KST\n\n내보낼 질문이 없습니다\n`뿐이다(SC-005, spec US4-1). (b) 이전 스냅샷에 질문이 있었어도 0건으로 대체된다(US4-2). (c) 출력 폴더가 없어도 만들고 성공한다(SC-006, US4-3). (d) `dbPath`가 없는 파일이면 `exportSnapshot`이 오류를 던지고 출력 파일을 만들지도 바꾸지도 않는다. (e) 출력 경로의 부모가 **파일**이라 폴더를 만들 수 없는 경우 실패하고 기존 스냅샷이 있다면 그대로다(US4-4, 4-5). (f) 실패 후 출력 폴더에 `qna.md.tmp-*` 임시 파일이 남지 않는다. 실행해 **실패를 확인**한다.
- [X] T016 [P] [US4] `tests/integration/snapshot-cli.test.js`를 만든다. `scripts/export-snapshot.js`를 `child_process.spawnSync(process.execPath, [...], { env: { QNA_DB, QNA_SNAPSHOT_PATH } })`로 실행해 `contracts/cli.md`의 표를 검증한다: 성공 시 종료 코드 0과 `스냅샷을 만들었습니다. 질문 N건, 답변 M건`, 질문 0건 시 `스냅샷을 만들었습니다. 내보낼 질문이 없습니다`, DB 없음 시 종료 코드 1과 `게시판 DB를 읽을 수 없습니다.`, 쓰기 실패 시 종료 코드 1과 `스냅샷 파일을 쓸 수 없습니다.`. 오류 출력에 임시 폴더 경로, 사번, 이름, 본문이 없음도 확인한다.

### Implementation for User Story 4

- [X] T017 [US4] `src/snapshot.js`에서 오류를 두 종류로 구분해 던진다: DB 열기·조회 실패 → `code: 'DB_READ'`, 폴더 생성·임시 파일 쓰기·교체 실패 → `code: 'WRITE'`. 어느 경우든 임시 파일을 `finally`에서 지우고, DB 오류일 때는 출력 폴더를 만들지 않도록 순서를 맞춘다(조회 → 렌더링 → 폴더 생성 → 쓰기). 질문 0건이면 렌더링이 안내 문구 형식을 돌려주도록 한다. T015가 통과해야 한다.
- [X] T018 [US4] `scripts/export-snapshot.js`가 오류 `code`에 따라 `게시판 DB를 읽을 수 없습니다.` 또는 `스냅샷 파일을 쓸 수 없습니다.`를 `console.error`로 출력하고 `process.exitCode = 1`로 끝나게 한다. 원본 오류 메시지·스택·경로는 출력하지 않는다. 질문 0건 성공 메시지는 `스냅샷을 만들었습니다. 내보낼 질문이 없습니다`로 한다. T016이 통과해야 한다.

**Checkpoint**: 모든 실패 경우가 계약대로 동작함.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: 헌법 검증과 마무리

- [X] T019 [P] 로그 개인정보 테스트 `tests/integration/snapshot-logging.test.js`를 만든다. `captureLogs()`(tests/helpers/server.js)로 성공·실패 실행의 로그를 캡처해 사번·이름·제목·본문·DB 경로가 없고, 허용 필드(`event`, `at`, `result`)만 있는지 검증한다(헌법 III, FR-014). 이어서 `src/snapshot.js`와 `scripts/export-snapshot.js`에서 `src/logger.js`의 `event({ event: 'snapshot_export', result: 'ok' | 'fail' })`만 호출하도록 구현을 맞춘다.
- [X] T020 [P] `tests/integration/snapshot-no-network.test.js`를 만든다. `src/snapshot.js`와 `scripts/export-snapshot.js`에 `http`, `https`, `net`, `fetch`, 외부 URL(`https?://`) 문자열이 없는지 검사한다(헌법 V, FR-016). 외부 패키지가 추가되지 않았는지 `package.json`에 `dependencies`·`devDependencies`가 없음도 확인한다(헌법 II).
- [X] T021 [P] 성능 확인 테스트 `tests/integration/snapshot-scale.test.js`를 만든다. 질문 1,000건·답변 3,000건(제목·본문은 짧게)을 삽입해 내보내기가 60초 안에 끝나고 건수가 일치함을 확인한다(SC-004).
- [X] T022 `specs/003-qna-snapshot/quickstart.md`의 1~2단계를 고친다. `npm run seed`의 대상 DB는 기본 `./data/test.sqlite`이므로 실행 명령을 `QNA_DB=./data/test.sqlite npm run snapshot`(PowerShell은 `$env:QNA_DB='./data/test.sqlite'; npm run snapshot`)으로 바꾼다.
- [X] T023 `quickstart.md`의 3~4단계를 직접 실행해 확인한다(생성 시각, 건수, 이름·사번 검색 0건, 재실행 동일, 폴더 없음, 질문 없음, DB 없음). 결과를 `npm test` 전체 통과와 함께 확인하고 실패가 있으면 해당 작업으로 돌아간다.
- [X] T024 `README.md`에 스냅샷 내보내기 절(실행 명령, 환경 변수 `QNA_SNAPSHOT_PATH`, 산출물 형식 링크, 읽기 전용·개인정보 제외 보장)을 추가한다.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 바로 시작. T003은 T001·T002와 병렬 가능
- **Foundational (Phase 2)**: Setup 후. T004(테스트) → T005(구현)
- **US1 → US2 → US3 → US4**: 모두 `src/snapshot.js`를 키우므로 **순서대로** 진행한다. 각 스토리의 **테스트 파일**은 서로 다른 파일이라 미리 함께 써 둘 수 있다
- **Polish (Phase 7)**: 원하는 스토리가 끝난 뒤. T019~T021은 병렬 가능, T022 → T023 → T024는 순서대로

### User Story Dependencies

- **US1 (P1)**: Foundational 후 시작. 다른 스토리에 의존하지 않음
- **US2 (P1)**: US1의 `exportSnapshot`을 검증하므로 US1 뒤
- **US3 (P1)**: US1 뒤. 트랜잭션 변경(T014)이 US2 테스트도 계속 통과해야 함
- **US4 (P2)**: US1 뒤. 오류 구분(T017)이 US1~US3 테스트를 깨지 않아야 함

### Within Each User Story

- 테스트를 먼저 쓰고 실패를 확인한 뒤 구현한다(헌법 I). PR 설명에 실패 확인 사실을 적는다
- 구현 후 `npm test` 전체를 돌려 이전 스토리가 깨지지 않았는지 확인한다

### Parallel Opportunities

- T003은 T001·T002와 병렬
- 스토리별 테스트 파일 T006, T009, T010, T012, T013, T015, T016은 서로 다른 파일이라 병렬로 작성 가능(실행 확인은 각 스토리 구현 직전에)
- T019, T020, T021은 서로 다른 파일이라 병렬

---

## Parallel Example: 테스트 먼저 작성

```text
# 서로 다른 파일이므로 함께 작성 가능:
Task: "snapshot-export.test.js 작성 (tests/integration/snapshot-export.test.js)"
Task: "snapshot-privacy.test.js 작성 (tests/integration/snapshot-privacy.test.js)"
Task: "snapshot-kst.test.js 작성 (tests/integration/snapshot-kst.test.js)"
```

---

## Implementation Strategy

### MVP First (User Story 1만)

1. Phase 1 Setup, Phase 2 Foundational 완료
2. Phase 3 (US1) 완료: `npm run snapshot`이 파일을 만든다
3. **멈추고 검증**: 질문·답변 건수와 형식 확인. 단, 개인정보 제외(US2)와 DB 불변(US3)이 확정되기 전에는 운영 데이터로 실행하지 않는다

### Incremental Delivery

1. Setup + Foundational → 형식 고정
2. US1 → 내보내기 동작 (MVP)
3. US2 → 개인정보·KST 확정 (에이전트에 제공하려면 여기까지 필수)
4. US3 → 읽기 전용·일관성 확정
5. US4 → 빈 상태·실패 처리
6. Polish → 헌법 검증, 문서

---

## Notes

- 수정하는 기존 파일은 `src/config.js`(한 줄)와 `package.json`(한 줄), `README.md`(절 추가)뿐이다. 기존 서버·DB 코드는 건드리지 않는다.
- `[P]` 작업은 서로 다른 파일일 때만 표시했다. `src/snapshot.js`를 같이 고치는 작업은 `[P]`가 아니다.
- 각 작업이나 논리적 묶음 단위로 커밋한다.
- 피할 것: 작성자 컬럼 조회, `openDb()`·`migrate()` 호출, 본문 가공, 직접 날짜 포맷.
