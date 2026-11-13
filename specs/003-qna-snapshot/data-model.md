# Data Model: QnA 스냅샷

새 저장소나 테이블은 없다. 기존 001 SQLite의 `questions`, `answers`를 **읽기만** 한다.

## 입력(조회하는 컬럼만)

| 원천 | 컬럼 | 용도 |
|------|------|------|
| questions | id | 질문 번호 |
| questions | program_id | 프로그램 ID |
| questions | title | 제목 |
| questions | body | 본문 |
| questions | created_at | 질문 등록일 (epoch ms → KST) |
| answers | question_id | 질문과 연결 |
| answers | body | 답변 본문 |
| answers | created_at | 답변 등록일 (epoch ms → KST) |

**조회하지 않는 것**: `questions.author_id`, `answers.author_id`, `users.*`, `answerers.*`, `sessions.*`, `form_token`.

## 출력 구조

- **스냅샷 파일**: 생성 시각 줄 1개 + 질문 항목 0개 이상(질문 번호 오름차순). 질문이 0개이면 안내 문구 1줄.
- **질문 항목**: 질문 번호, 프로그램 ID, 제목, 본문, 질문 등록일, 답변 항목 0개 이상(`answers.id` 오름차순).
- **답변 항목**: 답변 본문, 답변 등록일.

## 규칙

- 질문 수와 답변 수는 DB와 100% 일치한다 (SC-001).
- 같은 DB로 두 번 내보내면 생성 시각 줄을 제외하고 동일하다 (SC-008).
- 상태 전이 없음. 매 실행은 파일 전체를 새로 대체한다.
