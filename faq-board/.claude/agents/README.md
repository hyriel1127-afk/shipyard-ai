# 서브에이전트 안내

이 폴더에는 QnA 게시판 작업을 돕는 서브에이전트 2개가 있습니다.

| 에이전트 | 하는 일 | 모델 | 쓸 수 있는 도구 |
|----------|---------|------|-----------------|
| `answer-finder` | 새 문의와 비슷한 기존 질문·답변을 찾아 후보와 근거를 보여 줍니다. | haiku | Read, Grep, Glob |
| `digest-notifier` | 주간 점검 보고서를 만들고, 답변 권한자에게 보낼 알림문 초안을 씁니다. | sonnet | Read, Write, Bash |

두 에이전트 모두 게시판 코드(`src/`, `tests/`, `specs/`)를 고치지 않습니다.

## 공통 선행조건

- Node.js 24 이상, 그리고 `npm install`(Neon 드라이버 설치).
- 프로젝트 루트에서 Claude Code를 실행합니다. 에이전트 정의는 `.claude/agents/`에서 자동으로 읽힙니다.
- Neon DB가 준비되어 있어야 합니다.
  - 프로젝트 루트 `.env`에 `DATABASE_URL`(Neon 연결 문자열)이 있어야 합니다. 에이전트는 환경변수를 줄 수 없지만 스크립트가 `.env`를 직접 읽습니다.
  - 스키마는 `npm run migrate -- up` 으로 미리 만들어 둡니다.
  - 시험용 데이터는 테스트용 Neon 브랜치에서만 `npm run seed` 로 만듭니다(운영 DB에는 쓰지 마세요).

---

## 1. answer-finder

### 선행조건

- `data/snapshot/qna.md` 파일이 있어야 합니다. 이 파일은 DB에서 내보낸 스냅샷이며 git에는 올라가지 않습니다(`.gitignore`).
- 스냅샷은 만든 시점의 내용입니다. 새 글이 올라왔다면 먼저 다시 내보냅니다.

  ```bash
  npm run snapshot                          # 또는 node scripts/export-qna-snapshot.js
  ```

- 이 에이전트는 명령을 실행하지 못하므로(Read, Grep, Glob만 허용) 스냅샷은 사람이 미리 만들어 둬야 합니다.

### 사용방법

Claude Code에서 이름을 지정하거나 자연어로 요청합니다.

```text
answer-finder 에이전트로 "로그인 후 화면이 비어 있어요"와 비슷한 기존 질문을 찾아 줘
```

### 동작과 출력

- 먼저 스냅샷 맨 위의 생성 시각을 알려 줍니다.
- 핵심 단어로 검색해 후보를 최대 3건 보여 줍니다. 후보마다 질문 번호, 프로그램 ID, 제목, 답변 요약(3줄 이내), 질문·답변 등록일을 적습니다.
- 답변이 등록된 지 365일이 넘었으면 "재검증이 필요할 수 있음"이라고 표시합니다.
- 비슷한 질문이 없으면 "기존 질문에서 찾지 못했습니다"라고 답합니다.
- `data/snapshot/qna.md`만 읽고, 사번과 이름은 말하지 않습니다.

---

## 2. digest-notifier

### 선행조건

- 위 공통 선행조건의 DB가 있어야 합니다. 스크립트는 DB를 조회만 합니다.
- `.claude/hooks/digest-guard.cjs` 가 있어야 합니다. 이 에이전트가 실행되는 동안에만 적용되는 PreToolUse 제한 훅입니다.
- `.claude/settings.json` 에 다음 권한이 있어야 합니다(이미 설정되어 있음).

  ```json
  "Bash(node scripts/weekly-digest.js)",
  "Bash(node scripts/export-qna-snapshot.js)",
  "Write(reports/**)"
  ```

- 에이전트는 환경변수를 줄 수 없으므로 DB는 `.env`의 `DATABASE_URL`로 결정됩니다.
- 보고서 폴더는 `QNA_REPORTS_DIR`(기본 `./reports`)입니다. 이 폴더는 git에 올라가지 않습니다.

### 사용방법

```text
digest-notifier 에이전트로 이번 주 점검 보고서를 만들고 알림문 초안을 작성해 줘
```

에이전트가 하는 순서는 다음과 같습니다.

1. `node scripts/weekly-digest.js` 로 `reports/digest-YYYY-MM-DD.md` 보고서를 만듭니다.
2. 가장 최근 보고서를 읽습니다.
3. `reports/notice-YYYY-MM-DD.md` 알림문 초안을 저장합니다.
4. 보고서 건수와 알림문 건수가 같은지 대조하고, 만든 파일과 실행한 명령을 알려 줍니다.

보고서만 따로 만들고 싶다면 에이전트 없이 `npm run digest` 를 실행해도 됩니다.

### 알림문 규칙

- 결론부터 씁니다(질문 몇 건, 답변 몇 건).
- 경과 일수가 큰 상위 5건을 적습니다.
- 해요체로 쓰고, 이모지와 느낌표는 쓰지 않습니다.
- 보고서에 없는 사실·숫자·날짜는 더하지 않고, 필요하면 `[확인 필요]`로 남깁니다.
- 사번과 이름은 쓰지 않습니다.

### 제한 사항 (훅이 강제)

| 도구 | 허용 | 그 밖의 경우 |
|------|------|--------------|
| Bash | `node scripts/weekly-digest.js`, `node scripts/export-qna-snapshot.js` 두 명령만 (명령 전체가 정확히 일치할 때) | 거부 |
| Write/Edit | `reports/notice-YYYY-MM-DD.md` 만 | 거부 (보고서 원본 `digest-*.md` 포함) |
| Read 등 | 제한 없음 | - |

훅 입력을 읽지 못하면 안전하게 거부합니다. 훅 시험은 `node .claude/hooks/digest-guard.test.cjs` 로 실행합니다.

---

## 문제 해결

| 증상 | 확인할 것 |
|------|-----------|
| answer-finder가 "파일이 없다"고 답함 | `npm run snapshot` 으로 `data/snapshot/qna.md` 생성 |
| 찾는 글이 결과에 없음 | 스냅샷 생성 시각이 오래됐는지 확인하고 다시 내보내기 |
| digest 보고서 생성 실패 ("만들지 못했습니다") | `.env`의 `DATABASE_URL`과 마이그레이션 여부 확인 |
| digest-notifier의 명령·쓰기가 거부됨 | 허용 범위 밖의 명령이나 경로입니다. 위 제한 사항 표 참고 |
