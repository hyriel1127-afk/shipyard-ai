---
name: weekly-report
description: 지난 7일 동안 닫힌 이슈와 병합된 PR로
  주간 보고 초안을 만든다
disable-model-invocation: true
---
1. github MCP로 지난 7일 동안 병합된 PR과
   닫힌 이슈를 가져온다.
2. 기능, 버그 수정, 기타로 나눈다.
3. templates/weekly.md 형식에 채운다.
4. 숫자는 MCP 결과에서 센 값만 쓴다.
   추정한 숫자는 넣지 않는다.

- 저장소는 git remote origin에서 정한다. 없으면 묻는다.
- 기간은 오늘(KST)을 포함한 7일이다. 첫 줄에 날짜를 쓴다.
- github 도구가 없거나 401, 403이 나오면 보고를 만들지
  않는다. GITHUB_PAT를 넣은 창에서 claude를 다시
  켜라고 안내하고 멈춘다.
- 결과가 많아 잘렸으면 다음 쪽까지 가져온다.
- 항목마다 PR이나 이슈 번호를 붙인다.
- 읽기만 한다. 이슈, PR, 댓글을 만들거나 고치지 않는다.
- 파일로 저장하지 않고 초안을 보여 준다.
