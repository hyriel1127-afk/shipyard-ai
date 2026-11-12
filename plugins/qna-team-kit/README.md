# qna-team-kit

QnA 게시판 팀이 같이 쓰는 Claude Code 플러그인입니다. 3일차 48장 강사 시연용 예시입니다. 실습 10의 qc-kit은 이 구조를 본떠 만듭니다.

## 들어 있는 것

| 종류 | 이름 | 하는 일 |
|---|---|---|
| 스킬 | `/qna-team-kit:ship [기능 설명]` | planner → coder → reviewer 순서로 계획, 구현, 검토. 반려는 최대 2번, push는 하지 않음 |
| 스킬 | `/qna-team-kit:weekly-report` | 지난 7일의 병합된 PR과 닫힌 이슈로 주간 보고 초안 |
| 에이전트 | planner, coder, reviewer | `/ship`이 부르는 세 역할 |
| 훅 | `hooks/hooks.json` | 보호 파일 편집을 막는 PreToolUse 훅 |
| MCP | `github` | GitHub 원격 MCP 서버. 읽기 전용(`X-MCP-Readonly`) |

두 스킬 모두 사람이 직접 불러야 돕니다(`disable-model-invocation: true`).

## 설치

```text
/plugin marketplace add <조직>/shipyard-ai
/plugin install qna-team-kit@shipyard-ai
/reload-plugins
```

## 필요한 것

- `GITHUB_PAT` 환경 변수. 저장소 Contents, Issues, Pull requests 읽기 권한만 준 fine-grained 토큰을 씁니다. 토큰을 넣은 터미널에서 `claude`를 켜야 `.mcp.json`이 읽습니다. 토큰은 파일에 쓰지 않습니다.
- Node.js(훅 실행용).

## 검사

```powershell
claude plugin validate ./plugins/qna-team-kit
```

맨 아래 `Validation passed`를 확인합니다. 위에 나오는 icon, LICENSE 항목은 공개 디렉터리에 낼 때만 필요합니다.

## 바꿀 때

- 에이전트와 `/ship`은 `labs/09-멀티에이전트/.claude`와 같은 내용을 유지합니다.
- 고친 뒤 `plugin.json`의 `version`을 올립니다. 올리지 않으면 이미 설치한 사람에게 새 내용이 가지 않습니다.
