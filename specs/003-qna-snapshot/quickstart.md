# Quickstart: 스냅샷 내보내기 검증

사전 조건: Node 24 이상, 저장소 루트에서 실행.

## 1. 테스트 데이터 준비

```text
npm run seed
```

001의 테스트용 시드로, `./data/test.sqlite`에 질문과 답변이 들어간다.

## 2. 내보내기 실행

```text
# bash
QNA_DB=./data/test.sqlite npm run snapshot
# PowerShell
$env:QNA_DB='./data/test.sqlite'; npm run snapshot
```

기대: 종료 코드 0, `스냅샷을 만들었습니다. 질문 N건, 답변 M건`(로거의 JSON 한 줄이 함께 나올 수 있음), `data/snapshot/qna.md` 생성. 형식은 [contracts/snapshot-file.md](./contracts/snapshot-file.md) 참고.

## 3. 확인 항목

| 확인 | 방법 | 기대 |
|------|------|------|
| 생성 시각 | 파일 첫 줄 확인 | `생성 시각: ... KST` |
| 건수 | `## 질문 ` 줄 수와 게시판 질문 수 비교 | 일치 |
| 개인정보 | 시드 사용자의 이름·사번으로 파일 검색 | 0건 |
| 읽기 전용 | 실행 전후 DB의 질문·답변 건수와 내용 비교 | 동일 |
| 재실행 | 한 번 더 실행 후 생성 시각 줄을 뺀 내용 비교 | 동일 |

## 4. 실패 경우

- **폴더 없음**: `data/snapshot` 폴더를 지우고 다시 실행 → 폴더가 만들어지고 성공.
- **질문 없음**: 질문이 0건인 DB를 `QNA_DB`로 지정해 실행 → 생성 시각 줄과 `내보낼 질문이 없습니다`만 있는 파일.
- **DB 없음**: `QNA_DB`에 없는 경로 지정 → 종료 코드 1, `게시판 DB를 읽을 수 없습니다.`, 기존 스냅샷 유지.

## 5. 자동 테스트

```text
npm test
```
