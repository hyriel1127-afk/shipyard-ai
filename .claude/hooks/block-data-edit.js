#!/usr/bin/env node
// PreToolUse 훅: <프로젝트>/data/ 아래 파일의 변경을 차단한다.
//  - Write / Edit / NotebookEdit : 대상 경로가 data/ 안이면 차단
//  - Bash / PowerShell           : 명령에 data/ 참조와 "쓰기성 동작"이 함께 있으면 차단 (휴리스틱)
const path = require("path");

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0); // 입력을 해석할 수 없으면 개입하지 않음
  }

  const tool = input.tool_name || "";
  const ti = input.tool_input || {};
  const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const baseDir = input.cwd || projectDir;
  const dataDir = path.resolve(projectDir, "data");
  const norm = (p) => (process.platform === "win32" ? p.toLowerCase() : p);

  const deny = (reason) => {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: reason,
        },
      })
    );
    process.exit(0);
  };

  const isInsideData = (p) => {
    const rel = path.relative(norm(dataDir), norm(path.resolve(baseDir, p)));
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  };

  // 1) 파일 편집 도구
  const target = ti.file_path || ti.notebook_path;
  if (target) {
    if (isInsideData(target)) {
      deny(`data/ 아래 파일은 원본 보호를 위해 편집할 수 없습니다: ${path.resolve(baseDir, target)}`);
    }
    process.exit(0);
  }

  // 2) 셸 도구 (Bash / PowerShell)
  if (tool === "Bash" || tool === "PowerShell") {
    const cmd = String(ti.command || "");
    if (!cmd) process.exit(0);

    // data 디렉터리 참조: data/ data\ "data" 또는 절대경로 <프로젝트>/data
    const absData = norm(dataDir).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const absDataAlt = absData.replace(/\\\\/g, "[\\\\/]");
    const refsData =
      /(^|[^\w.-])data([\\/]|["'`\s;|&)]|$)/i.test(cmd) ||
      new RegExp(absDataAlt, "i").test(cmd);

    // 쓰기·삭제·이동·복사·저장 성격의 동작
    const writeLike = [
      /\b(cp|mv|rm|rmdir|del|erase|ren|rename|touch|mkdir|ln|truncate|dd|install|rsync|chmod|chown)\b/i,
      /\b(copy|move|xcopy|robocopy|attrib|icacls|takeown)\b/i,
      /\b(Copy-Item|Move-Item|Remove-Item|Rename-Item|New-Item|Set-Item|Clear-Content|Set-Content|Add-Content|Out-File|Set-ItemProperty|Compress-Archive|Expand-Archive)\b/i,
      /\b(sed\s+(-\w*i|--in-place)|tee|perl\s+-\w*i)\b/i,
      /(?<![\d&-])>{1,2}(?![&=])/, // 리다이렉션 (2>&1, -> 등 제외)
      /\.(save|to_excel|to_csv|write|writelines|write_text|write_bytes|dump|unlink|remove|rename|replace)\s*\(/i,
      /\b(open\s*\([^)]*,\s*['"][wax+]|WriteAllText|WriteAllBytes|SaveAs|\.Save\()/i,
      /\bgit\s+(checkout|restore|reset|clean|rm|mv|apply)\b/i,
    ].some((re) => re.test(cmd));

    if (refsData && writeLike) {
      deny(
        `data/ 아래 파일은 원본 보호를 위해 ${tool}로 변경할 수 없습니다. ` +
          `(data/ 참조와 쓰기성 동작이 함께 감지됨) 명령: ${cmd.slice(0, 200)}`
      );
    }
  }
  process.exit(0);
});
