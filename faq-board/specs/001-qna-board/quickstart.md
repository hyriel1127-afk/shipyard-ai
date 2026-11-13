# Quickstart: 검증 가이드

구현 완료 후 기능이 end-to-end로 동작하는지 확인하는 절차. 계약 세부는 [contracts/http-endpoints.md](./contracts/http-endpoints.md), 스키마는 [data-model.md](./data-model.md) 참고.

## 사전 조건
- Node.js 24 이상 (`node -v`). `npm install` 불필요(의존성 없음).
- 외부 네트워크 없이 실행 가능해야 한다.

## 준비
```bash
export QNA_DB=./data/dev.sqlite
node scripts/migrate.js up
# data/programs.json 에 ["PRGM0001", "PRGM0002"] 를 나열한다
node scripts/admin.js add-user 1001 "홍길동" <비밀번호>      # 일반 사용자
node scripts/admin.js add-user 2001 "김담당" <비밀번호>      # 답변 담당자 후보
node scripts/admin.js add-answerer 2001
npm start        # http://localhost:3000
```

## 자동 검증
```bash
npm test         # node --test : contract / integration / unit
```
기대: 전부 통과. 구현 전에는 contract 테스트가 실패(Red)해야 한다.

## 수동 시나리오 (spec 인수 시나리오 대응)
| 단계 | 기대 결과 |
|------|-----------|
| 미로그인으로 `/` 접속 | 목록이 보이고 로그인 링크가 있음. `/questions/new`는 "로그인이 필요합니다." (US1-6, US2-7) |
| 1001 로그인 → `/questions/new`에서 `PRGM0001`로 등록 | 상세로 이동, 목록 맨 위에 추가 (US1-1, 2) |
| 프로그램 ID 비움 / `prg 1` / `PRGM9999` | 각각 정해진 오류 문구, 입력한 제목·내용 유지 (US1-3~5) |
| 등록 버튼 더블클릭 | 질문 1건만 생성 |
| 목록에서 `PRGM0001` 필터 → 해제 | 해당 ID만 → 전체 (US2-1, 2) |
| 1001 상세 화면 | 답변 입력란 없음 (US3-2) |
| 1001 세션으로 답변 POST를 curl로 직접 호출 | `403` "답변 권한이 없습니다.", 답변 수 불변 (US3-3) |
| 2001 로그인 → 답변 등록 | 답변 추가, 작성일시 KST (US3-1) |
| 제목에 `<script>alert(1)</script>` 입력 | 글자 그대로 표시, 실행되지 않음 |
| 마우스 없이 Tab/Enter만으로 질문 등록·필터·답변 등록 | 모두 수행 가능, 포커스 표시 보임 (NFR-A11Y-001) |

## 헌법 점검
```bash
grep -rnE "https?://" src public | grep -v localhost        # 외부 URL 없음 (V)
grep -rniE "log.*(name|emp_no|empno|사번)" src               # 로깅에 개인정보 없음 (III)
git diff main -- package.json                                # 의존성 항목 없음 (II)
```
로그 출력(stdout)에 사번·이름·본문이 없는지, 화면 시각이 KST인지 확인한다.

## 성능 확인 (선택)
(선택) 질문 10,000건을 시드한 DB에서 목록·상세·필터 p95가 2초 이내(NFR-PERF-003), 등록·답변 등록 p95가 3초 이내(NFR-PERF-002)인지 측정한다.
