// 보호 파일 편집 차단 훅 (PreToolUse)
// 등록: PreToolUse, matcher "Edit|Write", onFailure "block"
//   프로젝트는 .claude/settings.json, 플러그인은 hooks/hooks.json에 등록한다.
// 막는 대상: .env 계열(.env, .env.local, .env.example, prod.env, .envrc), package-lock.json, .git/ 아래
// 시험: node protect-files.test.js (같은 폴더)
//
// 판단 규칙
// - 입력 JSON을 읽지 못하거나 입력이 비어 있으면 막는다(fail-closed).
//   무엇을 고치려는지 모르는 편집은 통과시키지 않는다. 막힌 편집은 다시 시키면 되지만 새어 나간 편집은 되돌리기 어렵다.
// - 경로가 없는 호출은 통과시킨다(fail-open). 이 훅이 볼 대상이 없고, 경로 없는 Edit·Write는 도구가 스스로 거절한다.
// - file_path(Edit, Write, MultiEdit)와 notebook_path(NotebookEdit)를 본다. matcher에 MultiEdit, NotebookEdit를 더해도 그대로 동작한다.
// - 경로는 역슬래시, 대소문자, 따옴표, `.`과 `..`, 상대경로(입력의 cwd 기준),
//   Windows가 무시하는 이름 끝의 점과 공백(.env.), 대체 데이터 스트림(package-lock.json::$DATA)을 정리한 뒤 비교한다.
// - 결과는 종료 코드로 알린다. 0은 통과, 2는 차단이고 stderr가 Claude에게 이유로 전달된다.
//
// 한계(이 훅이 막지 못하는 길)
// - Bash, PowerShell 명령(Set-Content .env, sed -i, npm pkg set)은 matcher에 없어 이 훅을 거치지 않는다.
//   셸 쪽은 settings.json의 Read·Edit deny(파일 이름을 적은 명령과 리다이렉트 대상)와 사람의 승인으로 막는다.
//   명령 문자열을 검사하는 예는 labs/현업미션/참고/.claude/hooks/protect-data.js에 있다.
// - 심볼릭 링크, 정션, 8.3 짧은 이름(PACKAG~1.JSO)은 풀지 않는다.
// - npm install이 package-lock.json을 다시 쓰는 것은 막지 않는다. 의도한 동작이다.
"use strict";

const STDIN_TIMEOUT_MS = 5000;

const RULES = [
  {
    label: ".env",
    hit: (name) => name === ".env" || name === ".envrc" || name.startsWith(".env.") || name.endsWith(".env"),
    next: "비밀 값 파일은 Claude가 고치지 않습니다. 바꿀 키와 이유를 사용자에게 알려 직접 고치게 하세요.",
  },
  {
    label: "package-lock.json",
    hit: (name) => name === "package-lock.json",
    next: "package.json을 고친 뒤 npm install로 잠금 파일을 다시 만드세요.",
  },
  {
    label: ".git/",
    hit: (name) => name === ".git",
    next: ".git 안의 파일은 직접 고치지 않습니다. git 명령(git commit, git config 등)으로 처리하세요.",
  },
];

// 경로를 슬래시 구분, `.`·`..` 정리, 절대경로로 바꾼다. 대소문자는 표시용으로 남기고 비교할 때 낮춘다.
function normalizePath(raw, cwd) {
  let p = String(raw).trim().replace(/^["']+|["']+$/g, "").replace(/\\/g, "/");
  if (!p) return "";
  const isAbsolute = /^[a-zA-Z]:(\/|$)/.test(p) || p.startsWith("/");
  if (!isAbsolute && cwd) p = String(cwd).replace(/\\/g, "/").replace(/\/+$/, "") + "/" + p;
  let prefix = "";
  const drive = p.match(/^[a-zA-Z]:/);
  if (drive) {
    prefix = drive[0];
    p = p.slice(2);
  } else if (p.startsWith("//")) {
    prefix = "/"; // UNC 경로(//server/share)는 앞의 슬래시 하나를 살려 둔다
  }
  const out = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      out.pop();
      continue;
    }
    const clean = seg.split(":")[0].replace(/[. ]+$/, "");
    if (clean) out.push(clean);
  }
  return prefix + "/" + out.join("/");
}

function findHit(normalized) {
  const segments = normalized.toLowerCase().split("/").filter(Boolean);
  for (const rule of RULES) {
    if (segments.some(rule.hit)) return rule;
  }
  return null;
}

function finish(code, message) {
  if (!message) process.exit(code);
  process.stderr.write(message + "\n", () => process.exit(code));
}

function decide(raw) {
  const text = String(raw || "").replace(/^\uFEFF/, "").trim();
  if (!text) return finish(2, "차단: 훅 입력이 비어 있습니다.\n다음 행동: Claude Code가 보낸 입력이 없어 편집 대상을 확인하지 못했습니다. 같은 작업을 다시 요청하세요.");
  let input;
  try {
    input = JSON.parse(text);
  } catch (e) {
    return finish(2, `차단: 훅 입력 JSON을 읽지 못했습니다 (${e.message}).\n다음 행동: 같은 작업을 다시 요청하세요. 계속 막히면 .claude/hooks/protect-files.js를 확인하세요.`);
  }
  const toolInput = (input && typeof input.tool_input === "object" && input.tool_input) || {};
  const target = toolInput.file_path ?? toolInput.notebook_path;
  if (target === undefined || target === null || String(target).trim() === "") return finish(0);

  const normalized = normalizePath(target, input.cwd || process.cwd());
  const rule = findHit(normalized);
  if (!rule) return finish(0);
  return finish(2, `차단: ${normalized} (${rule.label} 보호 대상)\n다음 행동: ${rule.next}`);
}

if (process.stdin.isTTY) {
  finish(2, "사용법: 도구 호출 JSON을 표준 입력으로 넘깁니다.\n예: '{\"tool_input\":{\"file_path\":\"C:\\\\app\\\\.env\"}}' | node protect-files.js");
} else {
  let raw = "";
  const timer = setTimeout(() => finish(2, `차단: ${STDIN_TIMEOUT_MS / 1000}초 안에 훅 입력이 끝나지 않았습니다.\n다음 행동: 같은 작업을 다시 요청하세요.`), STDIN_TIMEOUT_MS);
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => (raw += chunk));
  process.stdin.on("end", () => {
    clearTimeout(timer);
    decide(raw);
  });
  process.stdin.on("error", (e) => {
    clearTimeout(timer);
    finish(2, `차단: 훅 입력을 읽다가 오류가 났습니다 (${e.message}).\n다음 행동: 같은 작업을 다시 요청하세요.`);
  });
}
