import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../../scripts/export-snapshot.js', import.meta.url));
const ROOT = fileURLToPath(new URL('../../', import.meta.url));

// DATABASE_URL 은 명시한 값만 쓴다. 프로젝트 .env 가 있어도 환경변수가 우선이므로 빈 값으로 덮어쓴다.
function run(env) {
  return spawnSync(process.execPath, [SCRIPT], { env: { ...process.env, DATABASE_URL: '', ...env }, encoding: 'utf8', cwd: os.tmpdir() });
}

test('DATABASE_URL 이 없으면: 종료 코드 1, 고정 문구, 기존 스냅샷 유지, 경로·원문 미노출', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qna-cli-'));
  try {
    const out = path.join(dir, 'snapshot', 'qna.md');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, 'KEEP\n');
    const r = run({ QNA_SNAPSHOT_PATH: out });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /게시판 DB를 읽을 수 없습니다\./);
    assert.ok(!r.stderr.includes(dir) && !r.stderr.includes(ROOT));
    assert.doesNotMatch(r.stderr, /\bat .*\(|\.js:\d+|postgres/i);
    assert.equal(fs.readFileSync(out, 'utf8'), 'KEEP\n');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// 실제 Neon(테스트용 브랜치) 연결이 필요한 시험. TEST_DATABASE_URL 이 있을 때만 실행한다.
const live = process.env.TEST_DATABASE_URL ? test : test.skip;

live('Neon 연결: 종료 코드 0과 건수 메시지', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qna-cli-'));
  try {
    const out = path.join(dir, 'snapshot', 'qna.md');
    const r = run({ DATABASE_URL: process.env.TEST_DATABASE_URL, QNA_SNAPSHOT_PATH: out });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /스냅샷을 만들었습니다\./);
    assert.ok(fs.existsSync(out));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
