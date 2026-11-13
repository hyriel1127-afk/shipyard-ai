# 사내 프로그램 문의 QnA 게시판

직원이 프로그램 ID를 붙여 질문을 올리고, 지정된 답변 담당자만 답변하는 사내 게시판입니다. 외부 npm 패키지 없이 Node.js 내장 모듈만 사용합니다. 읽기(목록·상세)는 로그인 없이 볼 수 있고, 질문·답변 등록은 로그인이 필요합니다.

## 실행

Node.js 24 이상이 필요합니다. `npm install`은 필요 없습니다.

```bash
node scripts/migrate.js up                 # DB 생성/마이그레이션
node scripts/admin.js add-user 1001 "홍길동" <비밀번호>
npm start                                  # http://127.0.0.1:3000
npm test                                   # node --test
```

## 환경변수

| 이름 | 기본값 | 설명 |
|------|--------|------|
| `QNA_PORT` | `3000` | 포트 |
| `QNA_HOST` | `127.0.0.1` | 바인드 주소. 사내망에 열려면 운영자가 사내 주소로 지정 |
| `QNA_DB` | `./data/qna.sqlite` | SQLite 파일 경로 |
| `QNA_PROGRAMS` | `./data/programs.json` | 유효 프로그램 ID 목록 파일 |
| `QNA_READONLY` | (없음) | `1`이면 POST를 503으로 막는 읽기 전용 모드 |
| `QNA_SNAPSHOT_PATH` | `./data/snapshot/qna.md` | 스냅샷 내보내기 출력 파일 |

## 관리자 CLI (사용자·답변 담당자)

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
npm run snapshot        # QNA_DB → ./data/snapshot/qna.md (QNA_SNAPSHOT_PATH로 변경 가능)
```

- DB를 **읽기 전용**으로 열어 데이터를 바꾸지 않습니다. 작성자 사번·이름은 조회하지 않아 파일에 들어가지 않습니다.
- 파일 첫 줄은 생성 시각(KST)입니다. 질문이 없으면 생성 시각과 `내보낼 질문이 없습니다`만 씁니다.
- 임시 파일에 쓴 뒤 교체하므로 실패해도 이전 스냅샷이 남고, 폴더가 없으면 만듭니다.
- 실패 시 종료 코드 1과 고정 문구(`게시판 DB를 읽을 수 없습니다.` / `스냅샷 파일을 쓸 수 없습니다.`)만 출력합니다.
- 파일 형식은 `specs/003-qna-snapshot/contracts/snapshot-file.md`, 실행 계약은 `contracts/cli.md`를 따릅니다. 수동 실행만 지원하며 실시간 동기화·외부 전송은 하지 않습니다.

## 프로그램 ID 목록 편집 (`data/programs.json`)

문자열 배열입니다. 예: `["PRGM0001", "PRGM0002"]`. 형식은 영문 대문자 4자 + 숫자 4자 + (선택) 영문 대문자 1자입니다.

- 파일을 저장하면 서버 재시작 없이 반영됩니다(수정 시각 변경 감지).
- 목록에서 ID를 빼도 기존 질문은 그대로 남고 필터도 동작하며, 그 ID로 새 질문만 등록할 수 없습니다.
- JSON이 깨지면 마지막 정상 목록을 유지하고 오류 로그(`programs.load_failed`)를 남깁니다. 서버 시작 때부터 읽지 못하면 질문 등록은 503입니다.
- 이 파일은 Git으로 버전 관리하고, 되돌릴 때는 이전 버전을 복원합니다.

## 마이그레이션 up / down

```bash
node scripts/migrate.js up
node scripts/migrate.js down
```

실행 전에 DB 파일 복사본(백업)이 만들어지고, 트랜잭션으로 실행됩니다. **`down`은 질문·답변 테이블을 삭제합니다.** 개발·초기 배포 직후에만 쓰고, 운영 데이터가 쌓인 뒤에는 `down` 대신 새 마이그레이션으로 앞으로 고치세요. 반드시 사전에 백업하세요.

## 배포 롤백

- 코드: 이전 태그로 되돌립니다.
- DB: 배포 전 백업 파일로 복원합니다. 스키마 변경이 없는 배포는 코드만 되돌립니다.
- 장애 시 임시 조치: `QNA_READONLY=1`로 재시작하면 읽기는 유지되고 쓰기는 503이 됩니다.

## 운영 시 주의

이 프로젝트는 강의 과제 제출 범위입니다. 실제 사내 배포에는 HTTPS 종단과 세션 쿠키 `Secure` 설정을 별도로 도입해야 합니다(로그인 잠금·서명 토큰도 범위 밖).

## 문서

명세·계획·계약·작업 목록은 `specs/001-qna-board/`에 있습니다. 스냅샷 내보내기는 `specs/003-qna-snapshot/`입니다.
