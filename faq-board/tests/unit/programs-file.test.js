import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPrograms } from '../../src/programs.js';
import { captureLogs } from '../helpers/server.js';

function tmp() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'prg-')), 'programs.json');
}
function touchFuture(p, secs) {
  const t = new Date(Date.now() + secs * 1000);
  fs.utimesSync(p, t, t);
}

test('목록 포함 여부를 판단한다', () => {
  const p = tmp();
  fs.writeFileSync(p, '["PRGM0001","PRGM0002A"]');
  const programs = createPrograms(p);
  assert.equal(programs.state(), 'ok');
  assert.equal(programs.has('PRGM0001'), true);
  assert.equal(programs.has('PRGM0002A'), true);
  assert.equal(programs.has('PRGM9999'), false);
  assert.deepEqual(programs.list(), ['PRGM0001', 'PRGM0002A']);
});
test('파일이 바뀌면 재시작 없이 반영된다', () => {
  const p = tmp();
  fs.writeFileSync(p, '["PRGM0001"]');
  const programs = createPrograms(p);
  assert.equal(programs.has('PRGM0003'), false);
  fs.writeFileSync(p, '["PRGM0001","PRGM0003"]');
  touchFuture(p, 5);
  assert.equal(programs.has('PRGM0003'), true);
});
test('JSON 이 깨지면 마지막 정상 목록을 유지하고 programs.load_failed 를 기록한다', () => {
  const p = tmp();
  fs.writeFileSync(p, '["PRGM0001"]');
  const programs = createPrograms(p);
  assert.equal(programs.has('PRGM0001'), true);
  const cap = captureLogs();
  try {
    fs.writeFileSync(p, '{깨진 json');
    touchFuture(p, 10);
    assert.equal(programs.has('PRGM0001'), true);
    assert.equal(programs.state(), 'ok');
    assert.ok(cap.lines().some((l) => l.event === 'programs.load_failed'));
  } finally {
    cap.restore();
  }
});
test('최초 로드 실패면 unavailable 이고 어떤 ID도 통과시키지 않는다', () => {
  const cap = captureLogs();
  try {
    const programs = createPrograms(path.join(os.tmpdir(), 'no-such-dir-qna', 'programs.json'));
    assert.equal(programs.state(), 'unavailable');
    assert.equal(programs.has('PRGM0001'), false);
  } finally {
    cap.restore();
  }
});
