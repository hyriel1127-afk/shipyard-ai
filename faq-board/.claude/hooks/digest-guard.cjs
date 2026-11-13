// digest-notifier 에이전트 제한 훅 (PreToolUse)
// 등록: .claude/agents/digest-notifier.md 의 hooks. 이 에이전트가 실행되는 동안에만 적용된다.
// 허용 규칙
// - Bash: 명령 전체가 `node scripts/weekly-digest.js` 또는 `node scripts/export-qna-snapshot.js` 와 정확히 같을 때만
// - Write: reports/notice-YYYY-MM-DD.md 만(보고서 원본 digest-*.md 와 다른 경로는 거부)
// - 그 밖의 도구(Read 등)는 판단하지 않는다.
// 거부는 종료 코드 2 + stderr(이유가 Claude에게 전달된다). 입력을 읽지 못하면 안전하게 거부한다(fail-closed).
// 시험: node digest-guard.test.cjs (같은 폴더)
"use strict";
const fs = require("fs");
const path = require("path");

const COMMANDS = ["node scripts/weekly-digest.js", "node scripts/export-qna-snapshot.js"];
const NOTICE = /^notice-\d{4}-\d{2}-\d{2}\.md$/;

function deny(reason) {
  process.stderr.write(`digest-notifier 제한: ${reason}\n`);
  process.exit(2);
}

function realParent(p) {
  // 아직 없는 파일이라도 부모 폴더의 실제 경로(심볼릭 링크·.. 해소)로 판단한다.
  try {
    return fs.realpathSync(path.dirname(p));
  } catch {
    return null;
  }
}

function main(raw) {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return deny("훅 입력을 읽지 못했습니다.");
  }
  const tool = input.tool_name;
  const ti = input.tool_input ?? {};
  const project = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();

  if (tool === "Bash") {
    const cmd = typeof ti.command === "string" ? ti.command.trim() : "";
    if (!COMMANDS.includes(cmd)) return deny("허용된 명령은 node scripts/weekly-digest.js 와 node scripts/export-qna-snapshot.js 뿐입니다.");
    return process.exit(0);
  }
  if (tool === "Write" || tool === "Edit") {
    const target = path.resolve(project, String(ti.file_path ?? ""));
    const parent = realParent(target);
    let reports;
    try {
      reports = fs.realpathSync(path.join(project, "reports"));
    } catch {
      reports = path.resolve(project, "reports"); // 아직 없으면 경로 문자열로 비교
    }
    const parentNorm = parent ?? path.dirname(target);
    const same = (a, b) => (process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b);
    if (!same(parentNorm, reports)) return deny("reports/ 폴더 바로 아래에만 쓸 수 있습니다.");
    if (!NOTICE.test(path.basename(target))) return deny("쓸 수 있는 파일은 reports/notice-YYYY-MM-DD.md 뿐입니다. 보고서 원본은 고치지 않습니다.");
    return process.exit(0);
  }
  process.exit(0);
}

let buf = "";
const timer = setTimeout(() => main(buf), 5000);
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (buf += c));
process.stdin.on("end", () => {
  clearTimeout(timer);
  main(buf);
});
