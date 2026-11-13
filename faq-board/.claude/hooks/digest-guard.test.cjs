// 시험: node .claude/hooks/digest-guard.test.cjs
"use strict";
const { spawnSync } = require("child_process");
const path = require("path");
const assert = require("assert");

const HOOK = path.join(__dirname, "digest-guard.cjs");
const project = path.resolve(__dirname, "..", "..");
const run = (input) =>
  spawnSync(process.execPath, [HOOK], { input: typeof input === "string" ? input : JSON.stringify(input), env: { ...process.env, CLAUDE_PROJECT_DIR: project }, encoding: "utf8" }).status;
const bash = (command) => run({ tool_name: "Bash", tool_input: { command } });
const write = (file_path) => run({ tool_name: "Write", tool_input: { file_path } });

const cases = [
  ["허용: weekly-digest", bash("node scripts/weekly-digest.js"), 0],
  ["허용: export-qna-snapshot", bash("node scripts/export-qna-snapshot.js"), 0],
  ["거부: 다른 명령", bash("ls"), 2],
  ["거부: 명령 연결", bash("node scripts/weekly-digest.js && rm -rf data"), 2],
  ["거부: 인자 추가", bash("node scripts/weekly-digest.js --x"), 2],
  ["거부: 다른 스크립트", bash("node scripts/admin.js"), 2],
  ["허용: notice 파일", write(path.join(project, "reports", "notice-2026-11-13.md")), 0],
  ["거부: 보고서 원본", write(path.join(project, "reports", "digest-2026-11-13.md")), 2],
  ["거부: src", write(path.join(project, "src", "a.js")), 2],
  ["거부: reports 하위 폴더", write(path.join(project, "reports", "x", "notice-2026-11-13.md")), 2],
  ["거부: .. 우회", write(path.join(project, "reports", "..", "src", "notice-2026-11-13.md")), 2],
  ["허용: Read는 판단 안 함", run({ tool_name: "Read", tool_input: { file_path: "x" } }), 0],
  ["거부: 입력 깨짐", run("not json"), 2],
];
let bad = 0;
for (const [name, got, want] of cases) {
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name} (종료 코드 ${got})`);
}
assert.strictEqual(bad, 0, `${bad}건 실패`);
