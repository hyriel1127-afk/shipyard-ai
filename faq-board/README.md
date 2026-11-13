# 사내 프로그램 문의 QnA 게시판

직원이 프로그램 ID를 붙여 질문을 올리고, 지정된 답변 담당자만 답변하는 게시판입니다. Vercel(서버리스 함수)에 배포하고 Neon(Postgres)에 저장합니다. 읽기(목록·상세)는 로그인 없이 볼 수 있고, 질문·답변 등록은 로그인이 필요합니다.

외부 패키지는 DB 드라이버 `@neondatabase/serverless` 1개(운영)와 테스트용 메모리 Postgres `@electric-sql/pglite` 1개(개발)뿐입니다. 사유는 `specs/004-vercel-neon/plan.md`에 있습니다.

## 로컬 실행

Node.js 24 이상이 필요합니다.

```bash
npm install
cp .env.example .env                       # DATABASE_URL 에 Neon 연결 문자열을 넣는다
npm run migrate -- up                      # 스키마 생성(여러 번 실행해도 안전)
node scripts/admin.js add-user 1001 "홍길동" <비밀번호>
node scripts/admin.js add-answerer 1001    # 답변 담당자 지정
npm start                                  # http://127.0.0.1:3000 (시작할 때 마이그레이션도 실행)
npm test                                   # 메모리 Postgres(PGlite)로 실행. Neon 계정 불필요
```

`.env`는 git에 올리지 않습니다. 환경변수로 직접 지정한 값이 `.env`보다 우선합니다.

## Vercel 배포

1. **Neon**: 프로젝트와 데이터베이스를 만들고, 대시보드에서 연결 문자열을 복사합니다. 서버리스에서는 호스트에 `-pooler`가 붙은 풀러 주소를 권장합니다(`?sslmode=require` 포함).
2. **스키마 만들기(배포 전, 사람이 1회)**: 로컬에서 `DATABASE_URL`을 그 Neon DB로 두고 `npm run migrate -- up`을 실행합니다. 함수가 여러 개 동시에 떠도 안전하도록 배포 중에는 마이그레이션을 실행하지 않습니다.
3. **첫 사용자·답변 담당자**: 같은 방법으로 `node scripts/admin.js add-user …`, `add-answerer …`를 실행합니다.
4. **Vercel 프로젝트**: 저장소를 가져오고(Framework Preset은 `Other`), 환경변수 `DATABASE_URL`을 등록합니다. 선택값은 아래 표를 봅니다.
5. **배포**: push 하면 배포됩니다. `vercel.json`이 모든 경로를 `api/index.js` 한 함수로 보냅니다. Vercel에서는 세션 쿠키에 `Secure`가 자동으로 붙고, 비밀번호 없는 테스트 로그인(`QNA_DEV_LOGIN`)은 켜지지 않습니다.

배포 후 확인: 목록 화면이 열리는지, 로그인 → 질문 등록 → 답변 흐름이 되는지 확인합니다. 화면이 500이면 Vercel 함수 로그에서 `http.access` 줄의 `result: "error"`를 먼저 봅니다(로그에는 접속 정보·개인정보가 남지 않습니다).

## 환경변수

| 이름 | 기본값 | 설명 |
|------|--------|------|
| `DATABASE_URL` | (필수) | Neon 연결 문자열. 코드·로그·화면에 남기지 않는다 |
| `QNA_PORT` | `3000` | 로컬 서버 포트 |
| `QNA_HOST` | `127.0.0.1` | 로컬 서버 바인드 주소 |
| `QNA_PROGRAMS` | `./data/programs.json` | 유효 프로그램 ID 목록 파일 |
| `QNA_READONLY` | (없음) | `1`이면 POST를 503으로 막는 읽기 전용 모드 |
| `QNA_SECURE_COOKIE` | (없음) | `1`이면 세션 쿠키에 `Secure`. Vercel에서는 자동 |
| `QNA_SNAPSHOT_PATH` | `./data/snapshot/qna.md` | 스냅샷 내보내기 출력 파일 |
| `QNA_REPORTS_DIR` | `./reports` | 점검 보고서 출력 폴더 |
| `TEST_DATABASE_URL` | (없음) | 있으면 실제 Neon 접속 시험(CLI·MCP)도 실행. 테스트용 브랜치만 쓸 것 |

## 관리자 CLI (사용자·답변 담당자)

대상 DB는 `DATABASE_URL`입니다.

```bash
node scripts/admin.js add-user <사번> <이름> <비밀번호>
node scripts/admin.js set-password <사번> <비밀번호>
node scripts/admin.js add-answerer <사번>      # 답변 담당자 지정
node scripts/admin.js remove-answerer <사번>   # 지정 해제(이전 답변은 유지)
```

답변 담당자 목록은 화면과 HTTP 응답에 노출되지 않습니다.

## 스냅샷 내보내기 (답변 검색 에이전트용)

답변 검색 에이전트가 게시판 DB를 직접 읽지 않고 파일로만 질문과 답변을 찾도록, 전체 내용을 마크다운 한 파일로 내보냅니다.

```bash
npm run snapshot        # DATABASE_URL → ./data/snapshot/qna.md (QNA_SNAPSHOT_PATH로 변경 가능)
```

- DB를 **읽기 전용 트랜잭션**(REPEATABLE READ)으로 조회해 데이터를 바꾸지 않고, 질문·답변을 한 시점 기준으로 읽습니다. 작성자 사번·이름은 조회하지 않아 파일에 들어가지 않습니다.
- 파일 첫 줄은 생성 시각(KST)입니다. 질문이 없으면 생성 시각과 `내보낼 질문이 없습니다`만 씁니다.
- 임시 파일에 쓴 뒤 교체하므로 실패해도 이전 스냅샷이 남고, 폴더가 없으면 만듭니다.
- 실패 시 종료 코드 1과 고정 문구(`게시판 DB를 읽을 수 없습니다.` / `스냅샷 파일을 쓸 수 없습니다.`)만 출력합니다.
- 파일 형식은 `specs/003-qna-snapshot/contracts/snapshot-file.md`, 실행 계약은 `contracts/cli.md`를 따릅니다. 수동 실행만 지원하며 실시간 동기화는 하지 않습니다.

## 점검 보고서와 MCP 서버

- `npm run digest`: `reports/digest-YYYY-MM-DD.md` 주간 점검 보고서(답변 없는 질문, 경과 일수 큰 순)를 만듭니다.
- `scripts/mcp-qna-report.js`: 답변 없는 질문과 마지막 답변 후 365일 이상 지난 질문을 표준 보고서로 돌려주는 MCP 서버(도구 `qna_review_report`)입니다. `.mcp.json`에 등록되어 있고, 프로젝트 루트 `.env`의 `DATABASE_URL`을 읽습니다.

## 프로그램 ID 목록 편집 (`data/programs.json`)

문자열 배열입니다. 예: `["PRGM0001", "PRGM0002"]`. 형식은 영문 대문자 4자 + 숫자 4자 + (선택) 영문 대문자 1자입니다.

- 이 파일은 **배포 파일**입니다. 수정은 저장소에서 하고 다시 배포해야 Vercel에 반영됩니다(서버리스에서는 런타임 파일 수정이 반영되지 않음). 로컬 서버는 파일을 저장하면 재시작 없이 반영합니다.
- 목록에서 ID를 빼도 기존 질문은 그대로 남고 필터도 동작하며, 그 ID로 새 질문만 등록할 수 없습니다.
- JSON이 깨지면 마지막 정상 목록을 유지하고 오류 로그(`programs.load_failed`)를 남깁니다. 시작 때부터 읽지 못하면 질문 등록은 503입니다.
- 이 파일은 Git으로 버전 관리하고, 되돌릴 때는 이전 버전을 복원합니다.

## 마이그레이션 up / down

```bash
npm run migrate -- up
npm run migrate -- down
```

**`down`은 질문·답변 테이블을 삭제합니다.** 개발·초기 배포 직후에만 쓰고, 운영 데이터가 쌓인 뒤에는 `down` 대신 새 마이그레이션으로 앞으로 고치세요. 운영 DB에 쓰기 전에는 Neon의 브랜치(복원 지점)를 먼저 만들어 두세요. 마이그레이션은 트랜잭션으로 실행됩니다.

## 배포 롤백

- 코드: Vercel 대시보드에서 이전 배포를 Promote(또는 Instant Rollback)합니다.
- DB: 스키마 변경이 없는 배포는 코드만 되돌립니다. 스키마를 바꿨다면 Neon의 시점 복원(Point-in-time restore)이나 사전에 만든 브랜치로 복원합니다.
- 장애 시 임시 조치: 환경변수 `QNA_READONLY=1`로 재배포하면 읽기는 유지되고 쓰기는 503이 됩니다.

## 운영 시 주의

- 세션 쿠키는 HTTPS에서만 전송되도록 Vercel에서 자동으로 `Secure`가 붙습니다. 로그인 잠금·서명 토큰은 범위 밖입니다.
- 접속 정보(`DATABASE_URL`)는 Vercel 환경변수로만 관리하고, 저장소·로그에 남기지 않습니다. 유출이 의심되면 Neon에서 비밀번호를 재설정(롤)하세요.
- 기존 SQLite 데이터를 Neon으로 옮기는 도구는 없습니다. 옮길 운영 데이터가 있으면 별도 작업이 필요합니다.

## 문서

명세·계획·계약·작업 목록은 `specs/001-qna-board/`에 있습니다. 스냅샷 내보내기는 `specs/003-qna-snapshot/`, Vercel·Neon 전환 계획은 `specs/004-vercel-neon/plan.md`입니다. 프로젝트 원칙은 `.specify/memory/constitution.md`(v2.0.0)입니다.
