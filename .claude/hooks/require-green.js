// 테스트 통과 강제 훅 (Stop)
// 등록: .claude/settings.json의 Stop. Claude가 응답을 끝내려 할 때 npm test를 돌린다.
// 실패하면 종료 코드 2로 끝내지 못하게 하고, stderr(실패 출력 끝부분)가 Claude에게 이유로 전달된다.
// 시험: node require-green.test.js (같은 폴더)
//
// 판단 규칙
// - stop_hook_active가 true면(이 훅이 이미 한 번 막아서 다시 멈추는 중) 막지 않는다. 같은 실패로 끝없이 도는 것을 막는다.
//   이때도 테스트는 다시 돌려, 아직 실패하면 사용자 화면에 경고(systemMessage)를 남긴다.
// - 입력 JSON을 읽지 못하면 stop_hook_active가 없는 것으로 보고 테스트를 돌린다.
//   판단 근거는 입력이 아니라 테스트 결과이기 때문이다. 연속으로 막히는 횟수는 Claude Code가 8번에서 끊는다.
// - 프로젝트 폴더: CLAUDE_PROJECT_DIR, 없으면 입력의 cwd, 그것도 없으면 현재 폴더.
// - package.json이 없거나 test 스크립트가 없거나 npm을 찾지 못하면 막지 않는다(fail-open).
//   확인할 테스트가 없는데 막으면 Claude가 고칠 수 없는 이유로 갇힌다. 대신 사용자 화면에 경고를 남긴다.
// - 테스트가 TEST_TIMEOUT_MS 안에 끝나지 않으면 실패로 보고 막는다. 멈춘 테스트도 고칠 대상이다.
//   훅 자체의 시간 제한(기본 600초)보다 짧게 둔다. REQUIRE_GREEN_TIMEOUT_MS 환경 변수로 바꿀 수 있다.
//
// 한계
// - 시간 초과로 끊을 때 프로세스 트리 전체를 끝낸다(Windows는 taskkill /T). 테스트가 띄운 별도 서비스(DB 서버 등)는 남을 수 있다.
// - 테스트 파일을 지우거나 건너뛰게 고쳐서 통과시키는 것은 이 훅이 알아채지 못한다. 리뷰와 git diff로 본다.
"use strict";
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const STDIN_TIMEOUT_MS = 5000;
const TEST_TIMEOUT_MS = Number(process.env.REQUIRE_GREEN_TIMEOUT_MS) || 240000;
const OUTPUT_TAIL = 1500;
const NOT_FOUND_CODES = [127, 9009]; // sh와 cmd.exe가 명령을 찾지 못했을 때의 종료 코드

function finish(code, { stderr, systemMessage } = {}) {
  // 파이프 쓰기가 끝난 뒤에 종료해야 메시지가 잘리지 않는다
  const writeErr = () => (stderr ? process.stderr.write(stderr + "\n", () => process.exit(code)) : process.exit(code));
  if (systemMessage) process.stdout.write(JSON.stringify({ systemMessage }) + "\n", writeErr);
  else writeErr();
}

function parseInput(raw) {
  try {
    const value = JSON.parse(String(raw || "").replace(/^﻿/, ""));
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function hasTestScript(dir) {
  const file = path.join(dir, "package.json");
  if (!fs.existsSync(file)) return { ok: false, why: `package.json이 없습니다 (${dir})` };
  try {
    const pkg = JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
    if (!pkg.scripts || !pkg.scripts.test) return { ok: false, why: "package.json에 test 스크립트가 없습니다" };
  } catch {
    // package.json이 깨졌으면 npm test가 실패로 알려 준다. 여기서는 그대로 돌린다.
  }
  return { ok: true };
}

// 시간 초과 때 셸 아래의 node까지 끝낸다. Windows는 taskkill /T, 그 밖은 프로세스 그룹 전체에 신호를 보낸다.
function killTree(child) {
  try {
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    else process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

function runTests(dir) {
  return new Promise((resolve) => {
    let output = "";
    let timedOut = false;
    const child = spawn("npm test --silent", {
      cwd: dir,
      shell: true,
      windowsHide: true,
      detached: process.platform !== "win32",
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
    });
    const keep = (chunk) => {
      output = (output + chunk).slice(-OUTPUT_TAIL * 4); // 끝부분만 쓰므로 메모리를 묶어 둔다
    };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, TEST_TIMEOUT_MS);
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ result: "unavailable", why: e.message });
    });
    child.on("close", (status) => {
      clearTimeout(timer);
      const clean = output.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").trimEnd();
      const tail = clean.length > OUTPUT_TAIL ? "...\n" + clean.slice(-OUTPUT_TAIL) : clean;
      if (timedOut) return resolve({ result: "timeout", tail });
      if (NOT_FOUND_CODES.includes(status)) return resolve({ result: "unavailable", why: "npm을 찾지 못했습니다" });
      resolve({ result: status === 0 ? "pass" : "fail", tail });
    });
  });
}

async function decide(input) {
  const dir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const check = hasTestScript(dir);
  if (!check.ok) return finish(0, { systemMessage: `require-green: ${check.why}. 테스트를 확인하지 않고 끝냅니다.` });

  const t = await runTests(dir);
  if (t.result === "unavailable") return finish(0, { systemMessage: `require-green: ${t.why}. 테스트를 확인하지 않고 끝냅니다.` });
  if (t.result === "pass") return finish(0);

  if (input.stop_hook_active === true) {
    return finish(0, { systemMessage: "require-green: 한 번 막은 뒤에도 npm test가 아직 통과하지 않은 채로 끝났습니다. 직접 npm test를 돌려 확인하세요." });
  }
  const head = t.result === "timeout"
    ? `테스트가 실패했습니다. 고친 뒤 끝내세요.\n(npm test가 ${Math.round(TEST_TIMEOUT_MS / 1000)}초 안에 끝나지 않았습니다. 멈춘 테스트나 닫히지 않은 서버를 찾으세요.)`
    : "테스트가 실패했습니다. 고친 뒤 끝내세요.";
  let next = "다음 행동: 아래 출력에서 실패한 테스트를 찾아 코드를 고치고, npm test가 통과한 뒤 끝내세요. 테스트를 지우거나 건너뛰게 바꾸지 마세요. 고칠 수 없으면 원인을 사용자에게 보고하세요.";
  if (/Cannot find module|MODULE_NOT_FOUND/.test(t.tail)) next += " 모듈을 찾지 못한다는 오류면 npm install이 되어 있는지 먼저 확인하세요.";
  return finish(2, { stderr: `${head}\n${next}\n--- npm test 출력 끝부분 ---\n${t.tail}` });
}

if (process.stdin.isTTY) {
  decide({}); // 터미널에서 직접 돌리면 입력 없이 테스트만 확인한다
} else {
  let raw = "";
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    clearTimeout(timer);
    decide(parseInput(raw));
  };
  const timer = setTimeout(start, STDIN_TIMEOUT_MS);
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => (raw += chunk));
  process.stdin.on("end", start);
  process.stdin.on("error", start);
}
