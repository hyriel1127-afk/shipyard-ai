// protect-files.js 시험기. 사용: node protect-files.test.js [훅 파일 경로]
// 훅 경로를 주지 않으면 같은 폴더의 protect-files.js를 시험한다. FAIL이 없으면 종료 코드 0이다.
"use strict";
const { spawnSync } = require("child_process");
const path = require("path");

const hook = path.resolve(process.argv[2] || path.join(__dirname, "protect-files.js"));
const edit = (file_path, extra = {}) => ({ tool_name: "Edit", tool_input: { file_path }, ...extra });

// [기대, 설명, 입력(객체면 JSON으로 보냄, 문자열이면 그대로 보냄), stderr에 있어야 할 문구]
const cases = [
  ["block", "Windows .env", edit("C:\\app\\.env"), "차단: C:/app/.env (.env 보호 대상)"],
  ["block", ".env.local", { tool_name: "Write", tool_input: { file_path: "/home/u/app/.env.local" } }, ".env 보호 대상"],
  ["block", ".env.example", edit("C:\\app\\.env.example"), ".env 보호 대상"],
  ["block", "prod.env", edit("C:/app/config/prod.env"), ".env 보호 대상"],
  ["block", ".envrc", edit("/home/u/app/.envrc"), ".env 보호 대상"],
  ["block", "대문자 .ENV", edit("C:\\APP\\.ENV"), ".env 보호 대상"],
  ["block", "끝에 점 (.env.)", edit("C:\\app\\.env."), ".env 보호 대상"],
  ["block", "끝에 공백", edit("C:\\app\\.env "), ".env 보호 대상"],
  ["block", "따옴표로 감싼 경로", edit("\"C:\\app\\.env\""), ".env 보호 대상"],
  ["block", "상대경로 + cwd", edit(".env", { cwd: "C:\\app" }), "차단: C:/app/.env"],
  ["block", "..로 돌아 들어감", edit("C:\\app\\src\\..\\.env"), "차단: C:/app/.env"],
  ["block", "package-lock.json", edit("C:\\app\\package-lock.json"), "npm install"],
  ["block", "하위 패키지의 package-lock.json", edit("/repo/packages/web/package-lock.json"), "package-lock.json 보호 대상"],
  ["block", "대체 데이터 스트림", edit("C:\\app\\package-lock.json::$DATA"), "package-lock.json 보호 대상"],
  ["block", ".git/config", edit("C:\\app\\.git\\config"), ".git/ 보호 대상"],
  ["block", ".git/hooks (상대경로)", { tool_name: "Write", tool_input: { file_path: ".git/hooks/pre-commit" }, cwd: "/repo" }, ".git/ 보호 대상"],
  ["block", "MultiEdit", { tool_name: "MultiEdit", tool_input: { file_path: "C:\\app\\.env", edits: [] } }, ".env 보호 대상"],
  ["block", "NotebookEdit", { tool_name: "NotebookEdit", tool_input: { notebook_path: "C:\\app\\.git\\x.ipynb" } }, ".git/ 보호 대상"],
  ["block", "tool_name 없이 수동 시험", { tool_input: { file_path: "C:\\app\\.env" } }, "차단: C:/app/.env (.env 보호 대상)"],
  ["block", "깨진 JSON", "{not json", "JSON을 읽지 못했습니다"],
  ["block", "빈 입력", "", "입력이 비어 있습니다"],
  ["block", "BOM이 붙은 JSON", "\uFEFF" + JSON.stringify(edit("C:\\app\\.env")), ".env 보호 대상"],
  ["allow", "src/app.js", edit("C:\\app\\src\\app.js")],
  ["allow", "config.env.js (이름에 .env가 들어 있을 뿐)", edit("C:\\app\\src\\config.env.js")],
  ["allow", ".gitignore", edit("C:\\app\\.gitignore")],
  ["allow", ".github/workflows", edit("C:\\app\\.github\\workflows\\ci.yml")],
  ["allow", "package.json", edit("C:\\app\\package.json")],
  ["allow", ".env 폴더를 빠져나옴", edit("C:\\app\\.env\\..\\README.md")],
  ["allow", "경로 없음", { tool_name: "Edit", tool_input: {} }],
  ["allow", "tool_input 없음", { tool_name: "Edit" }],
  ["allow", "다른 도구(Bash)", { tool_name: "Bash", tool_input: { command: "npm test" } }],
];

let bad = 0;
for (const [want, label, input, expectText] of cases) {
  const r = spawnSync(process.execPath, [hook], {
    input: typeof input === "string" ? input : JSON.stringify(input),
    encoding: "utf8",
    timeout: 10000,
  });
  const got = r.status === 2 ? "block" : r.status === 0 ? "allow" : `ERR${r.status ?? r.error?.code}`;
  const textOk = !expectText || (r.stderr || "").includes(expectText);
  const pass = got === want && textOk;
  if (!pass) bad++;
  console.log(`${pass ? "ok  " : "FAIL"} ${got.padEnd(5)} ${label}`);
  if (!pass) console.log(`     stderr: ${(r.stderr || "").trim().replace(/\n/g, " | ")}`);
}
console.log(`\n${cases.length - bad}/${cases.length} 통과`);
process.exit(bad ? 1 : 0);
