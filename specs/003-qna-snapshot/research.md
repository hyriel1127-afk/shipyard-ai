# Research: QnA 스냅샷 내보내기

미해결 NEEDS CLARIFICATION은 없다. 아래는 설계 결정과 근거다.

## 1. 읽기 전용 보장 방식

- **Decision**: `new DatabaseSync(path, { readOnly: true })`로 연다. 기존 `openDb()`와 `migrate()`는 호출하지 않는다(둘 다 폴더 생성·WAL 설정·마이그레이션 기록으로 쓰기가 발생).
- **Rationale**: 연결 수준에서 쓰기를 막으므로 코드 실수로도 데이터가 바뀌지 않는다. 실제로 확인한 결과 `readOnly`는 없는 파일을 만들지 않고 오류를 내며, 쓰기 SQL은 `attempt to write a readonly database`로 거부된다.
- **주의(구현 중 확인)**: WAL 모드 DB를 읽기 전용으로 열면 보조 파일 `-wal`·`-shm`이 (비어 있는 채로) 생길 수 있다. 데이터 파일과 내용은 바뀌지 않는다. `immutable=1`로 이를 피할 수 있으나 WAL의 최신 내용을 무시하므로 쓰지 않는다.
- **Alternatives**: SQL만 SELECT로 제한(실수 방어 약함), DB 파일 복사본을 읽기(복사 중 WAL 불일치 위험).

## 2. 한 시점의 일관된 내용

- **Decision**: 읽기 전용 연결에서 `BEGIN` 후 질문 조회와 답변 조회를 같은 트랜잭션 안에서 하고 `COMMIT`(또는 `ROLLBACK`)한다.
- **Rationale**: WAL 모드에서는 읽기 트랜잭션이 시작 시점의 스냅샷을 보므로, 내보내는 중 새 글이 올라와도 질문과 답변이 어긋나지 않는다(spec Edge Cases).
- **Alternatives**: 트랜잭션 없이 두 번 조회(어긋날 수 있음).

## 3. 개인정보 제외 방식

- **Decision**: SELECT 컬럼을 명시한다. 질문은 `id, program_id, title, body, created_at`, 답변은 `question_id, body, created_at`. `author_id`와 `users`는 조회하지 않는다.
- **Rationale**: 출력 단계에서 걸러내는 방식보다 데이터가 아예 메모리에 오지 않아 누출 경로가 없다(헌법 III).
- **Alternatives**: 전체 컬럼을 읽고 출력 때 제외(실수 위험).

## 4. 파일 쓰기와 실패 안전성

- **Decision**: 출력 폴더를 `mkdir -p`로 만들고, 같은 폴더에 임시 파일(`qna.md.tmp-<pid>`)을 쓴 뒤 `rename`으로 교체한다. 실패하면 임시 파일을 지우고 종료 코드 1.
- **Rationale**: 같은 폴더 안의 rename은 대체로 원자적이라 에이전트가 반쯤 쓰인 파일을 읽을 일이 없고, 쓰기 실패 시 이전 스냅샷이 그대로 남는다(spec US4-5). Windows에서도 기존 파일 위로 `fs.renameSync`가 동작한다.
- **Alternatives**: 직접 덮어쓰기(중간 실패 시 손상).

## 5. 마크다운 항목 경계와 본문 처리

- **Decision**: 질문마다 `## 질문 <번호>` 제목으로 시작하고, 제목·본문은 각 줄 앞에 `> `를 붙여 인용으로 쓴다. 본문의 줄바꿈과 문자는 그대로 보존한다.
- **Rationale**: 본문 줄이 항상 `>`로 시작하므로 본문에 `## 질문 99`나 `---`가 있어도 실제 항목 경계로 오인되지 않는다(FR-013). 가공(요약·마스킹)은 하지 않는다.
- **Alternatives**: 코드 펜스로 감싸기(본문에 펜스가 있으면 깨짐), 본문 이스케이프(원문 변형).

## 6. 시각 표기

- **Decision**: 기존 `formatKst()`를 재사용해 `YYYY-MM-DD HH:mm` 형식으로 쓰고 생성 시각 줄에는 `KST`를 덧붙인다. 초 단위는 표시하지 않는다.
- **Rationale**: 헌법 IV가 요구하는 공용 변환 함수를 쓰고 화면과 같은 표기를 유지한다. 분 단위면 자료 최신성 판단에 충분하다.
- **Alternatives**: 별도 포맷 함수(중복, 불일치 위험).

## 7. 실행 방식 (clarify에서 보류된 항목)

- **Decision**: `npm run snapshot`(= `node scripts/export-snapshot.js`)으로 운영 담당자가 수동 실행한다. 기본 입력은 기존 `QNA_DB`, 출력은 `QNA_SNAPSHOT_PATH`(기본 `./data/snapshot/qna.md`).
- **Rationale**: 기존 `scripts/` 패턴과 일치하고 자동 주기 실행·실시간 동기화는 범위 밖이다.
- **Alternatives**: 서버 엔드포인트로 노출(권한 문제와 불필요한 공격면).

## 8. "답변 없음" 표기 (clarify에서 Outstanding이던 항목)

- **Decision**: 답변이 없는 질문에는 `### 답변 없음` 한 줄을 쓴다.
- **Rationale**: 에이전트가 "답변이 아직 없다"는 사실을 문장으로 확인할 수 있고, 답변 항목과 구별된다.

## 9. 파일 위치와 버전 관리

- **Decision**: 산출물 폴더를 `.gitignore`에 `data/snapshot/`로 추가한다.
- **Rationale**: 실행할 때마다 달라지는 생성물이며 본문 내용을 담고 있어 저장소에 남길 이유가 없다.
