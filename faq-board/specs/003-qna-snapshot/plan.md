# Implementation Plan: QnA 게시판 읽기 전용 스냅샷 내보내기

**Branch**: `003-qna-snapshot` | **Date**: 2026-11-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-qna-snapshot/spec.md`

## Summary

게시판 SQLite 파일을 **읽기 전용으로 열어** 모든 질문과 답변을 `data/snapshot/qna.md` 한 파일로 쓰는 명령줄 내보내기를 추가한다. 기존 001 게시판과 같은 Node 내장 모듈만 사용하며 외부 패키지는 추가하지 않는다. 작성자 사번·이름은 조회 단계에서 아예 읽지 않고, 파일은 임시 파일에 쓴 뒤 교체해 실패 시 이전 스냅샷이 손상되지 않게 한다. 결정 근거는 [research.md](./research.md).

## Technical Context

**Language/Version**: Node.js 24 이상(개발 v26), JavaScript(ESM), 빌드 없음 — 001과 동일

**Primary Dependencies**: 없음 (`node:sqlite`, `node:fs`, `node:path`, `node:test`만 사용 → 헌법 II 충족, 추가 사유 기록 대상 없음)

**Storage**: 입력은 001의 SQLite 파일(읽기 전용으로만 연다), 출력은 마크다운 파일 1개(`data/snapshot/qna.md`)

**Testing**: `node --test`. 임시 DB와 임시 출력 경로로 내보내기 함수와 명령을 직접 호출해 검증

**Target Platform**: 사내망 Windows/Linux, 게시판 서버와 같은 호스트에서 수동 실행

**Project Type**: CLI 스크립트 (기존 `scripts/` 패턴을 따르며, 서버 엔드포인트는 추가하지 않음)

**Performance Goals**: 질문 1,000건·답변 3,000건을 1분 이내 (SC-004)

**Constraints**: DB 쓰기 0건(읽기 전용 연결 + 마이그레이션 호출 금지), 작성자 필드 미조회, 시각은 공용 `formatKst()`로 KST 표시, 로그에는 `src/logger.js`의 허용 필드만 사용, 외부 네트워크 호출 없음

**Scale/Scope**: 질문 최대 약 10,000건(001 성능 목표와 동일). 분할 없이 파일 1개

## Constitution Check

*GATE: Phase 0 이전 통과 필요. Phase 1 설계 후 재확인.*

| 원칙 | 판정 | 근거 / 이행 방법 |
|------|------|------------------|
| I. API 테스트 우선 | 통과 | 새 API 엔드포인트는 없다. 대신 파일 형식 계약([contracts/snapshot-file.md](./contracts/snapshot-file.md))과 명령 계약([contracts/cli.md](./contracts/cli.md))의 테스트를 구현보다 먼저 작성하고 실패를 확인한다 |
| II. 최소 외부 패키지 | 통과 | 외부 패키지 0개, `package.json`에는 `scripts.snapshot` 한 줄만 추가 |
| III. 개인정보 로그 금지 | 통과 | 조회 SQL에서 `author_id`, `users` 테이블을 건드리지 않아 이름·사번이 메모리에도 올라오지 않는다. 로그는 `event()`에 결과(`ok`/`fail`)만 넘기고, 오류 메시지에는 원인 분류 문구만 쓴다. 로그 캡처 테스트 포함 |
| IV. 한국어와 KST | 통과 | 파일 안내 문구와 명령 출력·오류는 한국어, 모든 시각은 `src/time.js`의 `formatKst()` 사용. UTC 자정 경계 테스트 포함 |
| V. 사내망 전용 | 통과 | 네트워크 코드 없음. 출력은 로컬 파일뿐 |

**설계 후 재확인(Phase 1 완료)**: 판정 유지. 위반 없음 → Complexity Tracking 비움.

## Project Structure

### Documentation (this feature)

```text
specs/003-qna-snapshot/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── snapshot-file.md   # qna.md 파일 형식 계약
│   └── cli.md             # 실행 명령·종료 코드·메시지 계약
├── checklists/requirements.md
└── tasks.md               # /speckit-tasks 에서 생성
```

### Source Code (repository root)

```text
src/
├── snapshot.js            # 신규: exportSnapshot(opts) — 조회, 마크다운 생성, 원자적 쓰기
└── config.js              # 수정: snapshotPath(QNA_SNAPSHOT_PATH, 기본 ./data/snapshot/qna.md) 추가
scripts/
└── export-snapshot.js     # 신규: 명령 진입점 (npm run snapshot)
tests/
├── helpers/snapshot-db.js                 # 신규: 임시 파일 DB 준비 도우미
├── unit/snapshot-format.test.js           # 신규: 마크다운 생성, 인용 처리, KST 표기
└── integration/
    ├── snapshot-export.test.js            # 신규: 전체 내용, 순서, 덮어쓰기, 항목 경계
    ├── snapshot-privacy.test.js           # 신규: 작성자 값 미포함, 소스 검사
    ├── snapshot-kst.test.js               # 신규: UTC 경계 시각
    ├── snapshot-readonly.test.js          # 신규: 실행 전후 DB 불변
    ├── snapshot-consistency.test.js       # 신규: 한 시점 일관성
    ├── snapshot-failures.test.js          # 신규: 질문 없음, 폴더 없음, DB 없음, 쓰기 실패
    ├── snapshot-cli.test.js               # 신규: 명령 종료 코드·메시지
    ├── snapshot-logging.test.js           # 신규: 로그 개인정보
    ├── snapshot-no-network.test.js        # 신규: 네트워크·패키지 금지
    └── snapshot-scale.test.js             # 신규: 질문 1,000건·답변 3,000건
data/snapshot/             # 출력 위치 (.gitignore 에 추가)
README.md                  # 수정: 스냅샷 내보내기 절 추가
```

**Structure Decision**: 001의 단일 프로젝트 구조에 파일 두 개와 테스트를 더한다. 핵심 로직은 `src/snapshot.js`에 두고 `scripts/`는 얇은 진입점으로 유지해 테스트가 프로세스를 띄우지 않고도 함수를 직접 호출하게 한다.

**테스트 전용 훅**: `exportSnapshot`은 선택 인자 `afterQuestionsRead`(질문 조회 직후 호출)를 받는다. 질문 조회와 답변 조회 사이에 다른 연결이 글을 추가해도 한 시점의 내용만 담긴다는 점(spec Edge Cases)을 결정적으로 재현할 방법이 이것뿐이기 때문이다. 운영 실행에서는 전달하지 않아 동작에 영향이 없고, 같은 기능을 외부 노출 없이 함수 인자로만 둔다.

## Complexity Tracking

위반 없음.
