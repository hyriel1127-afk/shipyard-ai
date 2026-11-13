# Data Model: 사내 프로그램 문의 QnA 게시판

시각은 UTC epoch ms(INTEGER)로 저장하고 표시할 때 KST로 변환한다. 수정·삭제 기능이 없으므로 질문·답변은 영구 보관된다(NFR-PRIV-001).

## users (사용자)
| 필드 | 타입 | 제약 |
|------|------|------|
| id | INTEGER | PK, 내부 식별자(로그에는 이것만 사용) |
| emp_no | TEXT | UNIQUE NOT NULL (개인정보, 로그 금지) |
| name | TEXT | NOT NULL (화면 작성자 표시용, 로그 금지) |
| password_hash | TEXT | NOT NULL (scrypt, 솔트 포함) |

## answerers (답변 담당자 사번 목록)
| 필드 | 타입 | 제약 |
|------|------|------|
| emp_no | TEXT | PK |

- 일반 사용자/답변 담당자 구분은 `users.emp_no ∈ answerers.emp_no` 여부로 매 요청 판정한다.
- 목록에서 제거해도 기존 답변은 유지된다.

## 허용 프로그램 ID 목록 (DB 테이블 아님)

`data/programs.json`(문자열 배열)이 유일한 원천이다. 서버가 `src/programs.js`로 읽어 질문 등록 시 검증한다. 시스템 관리자가 운영 절차로 편집하며 화면 기능은 없다. DB에는 FK를 두지 않는다.

## questions (질문)
| 필드 | 타입 | 제약 |
|------|------|------|
| id | INTEGER | PK AUTOINCREMENT |
| program_id | TEXT | NOT NULL, CHECK(길이 > 0, 형식 `[A-Z]{4}[0-9]{4}[A-Z]?`), 값의 목록 포함 여부는 서버가 `data/programs.json`으로 검증 |
| title | TEXT | NOT NULL, 1~100자 |
| body | TEXT | NOT NULL, 1~4,000자 |
| author_id | INTEGER | NOT NULL, FK → users |
| created_at | INTEGER | NOT NULL |
| form_token | TEXT | UNIQUE NOT NULL (서버가 발급한 무작위 토큰, 중복 제출 방지) |

인덱스: `(id DESC)`, `(program_id, id DESC)`.
태그 컬럼 없음(FR-006), 채택 컬럼 없음(FR-016).

## answers (답변)
| 필드 | 타입 | 제약 |
|------|------|------|
| id | INTEGER | PK AUTOINCREMENT |
| question_id | INTEGER | NOT NULL, FK → questions |
| body | TEXT | NOT NULL, 1~4,000자 |
| author_id | INTEGER | NOT NULL, FK → users |
| created_at | INTEGER | NOT NULL |
| form_token | TEXT | UNIQUE NOT NULL (서버가 발급한 무작위 토큰) |

인덱스: `(question_id, id ASC)` — 등록 순서 표시(FR-013). 목록의 답변 수는 그룹 집계 한 번으로 구해 N+1을 피한다.

## sessions (세션)
| 필드 | 타입 | 제약 |
|------|------|------|
| token_hash | TEXT | PK (SHA-256) |
| user_id | INTEGER | NOT NULL, FK → users |
| csrf_token | TEXT | NOT NULL |
| expires_at | INTEGER | NOT NULL |

## 관계
users 1—N questions, users 1—N answers, questions 1—N answers.

## 검증 규칙 (`src/validation.js`의 공통 `validate()`, 실패는 모두 HTTP 400)
- program_id: 값이 배열(필드가 여러 개)이면 `PROGRAM_ID_FORMAT`. 아니면 trim → 빈 값 `PROGRAM_ID_REQUIRED` → 정규식 불일치 `PROGRAM_ID_FORMAT` → `data/programs.json`에 없으면 `PROGRAM_ID_UNKNOWN`.
- title: trim 후 비면 `TITLE_REQUIRED`, 100자 초과 `TITLE_TOO_LONG`.
- body(질문·답변): trim 후 비면 `BODY_REQUIRED`, 4,000자 초과 `BODY_TOO_LONG`.
- 글자 수는 유니코드 코드포인트 기준.

## schema_migrations
| 필드 | 타입 | 제약 |
|------|------|------|
| version | TEXT | PK (예: `001_init`) |
| applied_at | INTEGER | NOT NULL |
