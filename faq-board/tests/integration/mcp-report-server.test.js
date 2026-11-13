import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SERVER = fileURLToPath(new URL('../../scripts/mcp-qna-report.js', import.meta.url));

// MCP 서버를 띄워 JSON-RPC 요청을 줄 단위로 주고받는다. DATABASE_URL 은 명시한 값만 쓴다(.env 는 읽지 않도록 값을 비워 둔다).
function startServer(env) {
  // 빈 값으로 고정해 두면 프로젝트 .env 의 실제 접속 정보가 시험에 섞이지 않는다(loadEnvFile 은 이미 설정된 값을 덮어쓰지 않는다).
  const child = spawn(process.execPath, [SERVER], { env: { ...process.env, DATABASE_URL: '', ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '';
  const waiters = new Map();
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (c) => {
    buf += c;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      waiters.get(msg.id)?.(msg);
    }
  });
  let id = 0;
  return {
    child,
    request(method, params) {
      const myId = ++id;
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('응답 시간 초과')), 15000);
        waiters.set(myId, (m) => { clearTimeout(t); resolve(m); });
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: myId, method, params }) + '\n');
      });
    },
    notify(method) {
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n');
    },
    stop() { child.kill(); },
  };
}

const INIT = { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } };

test('initialize → tools/list, 알 수 없는 도구·잘못된 인자는 오류', async () => {
  const s = startServer({});
  try {
    const init = await s.request('initialize', INIT);
    assert.ok(init.result.capabilities.tools);
    assert.equal(init.result.serverInfo.name, 'qna-report');
    s.notify('notifications/initialized');

    const list = await s.request('tools/list', {});
    assert.deepEqual(list.result.tools.map((t) => t.name), ['qna_review_report']);

    const bad = await s.request('tools/call', { name: 'qna_review_report', arguments: { stale_days: 0 } });
    assert.equal(bad.result.isError, true);

    const unknown = await s.request('tools/call', { name: 'nope', arguments: {} });
    assert.ok(unknown.error);
  } finally {
    s.stop();
  }
});

test('DATABASE_URL 이 없으면 고정 문구 오류를 돌려주고 접속 정보·경로를 노출하지 않는다', async () => {
  const s = startServer({});
  try {
    await s.request('initialize', INIT);
    const call = await s.request('tools/call', { name: 'qna_review_report', arguments: {} });
    assert.equal(call.result.isError, true);
    assert.equal(call.result.content[0].text, '게시판 DB를 읽을 수 없습니다.');
  } finally {
    s.stop();
  }
});

// 실제 Neon(테스트용 브랜치) 연결이 필요한 시험. TEST_DATABASE_URL 이 있을 때만 실행한다.
const live = process.env.TEST_DATABASE_URL ? test : test.skip;

live('Neon 연결: 보고서를 만들고, save 일 때만 파일을 저장한다', async () => {
  const reports = fs.mkdtempSync(path.join(os.tmpdir(), 'qna-rep-'));
  const s = startServer({ DATABASE_URL: process.env.TEST_DATABASE_URL, QNA_REPORTS_DIR: path.join(reports, 'out') });
  try {
    await s.request('initialize', INIT);
    const call = await s.request('tools/call', { name: 'qna_review_report', arguments: {} });
    assert.ok(!call.result.isError, call.result.content[0].text);
    assert.match(call.result.content[0].text, /# QnA 게시판 점검 보고서/);
    assert.equal(fs.existsSync(path.join(reports, 'out')), false);

    const saved = await s.request('tools/call', { name: 'qna_review_report', arguments: { save: true } });
    assert.match(saved.result.content[0].text, /review-\d{4}-\d{2}-\d{2}\.md/);
    assert.equal(fs.readdirSync(path.join(reports, 'out')).filter((f) => /^review-\d{4}-\d{2}-\d{2}\.md$/.test(f)).length, 1);
  } finally {
    s.stop();
    fs.rmSync(reports, { recursive: true, force: true });
  }
});
