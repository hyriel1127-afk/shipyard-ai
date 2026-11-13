import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { exportSnapshot } from '../../src/snapshot.js';
import { makeSnapshotFixture } from '../helpers/snapshot-db.js';

function run(now, qAt, aAt) {
  const fx = makeSnapshotFixture();
  try {
    const q = fx.addQuestion({ createdAt: qAt });
    fx.addAnswer({ questionId: q, createdAt: aAt });
    exportSnapshot({ dbPath: fx.dbPath, outPath: fx.outPath, now });
    return fs.readFileSync(fx.outPath, 'utf8');
  } finally {
    fx.cleanup();
  }
}

test('UTC 자정 전·후 시각이 KST로 올바르게 표시된다', () => {
  const before = Date.UTC(2026, 10, 12, 14, 59, 59); // KST 11-12 23:59
  const after = Date.UTC(2026, 10, 12, 15, 0, 0); // KST 11-13 00:00
  const t1 = run(before, before, after);
  assert.match(t1, /^생성 시각: 2026-11-12 23:59 KST$/m);
  assert.match(t1, /^- 질문 등록일: 2026-11-12 23:59$/m);
  assert.match(t1, /^- 답변 등록일: 2026-11-13 00:00$/m);
  const t2 = run(after, after, before);
  assert.match(t2, /^생성 시각: 2026-11-13 00:00 KST$/m);
});

test('생성 시각은 파일의 첫 줄이다', () => {
  const t = run(Date.UTC(2026, 10, 13, 5, 5), Date.UTC(2026, 10, 13, 5, 5), Date.UTC(2026, 10, 13, 5, 5));
  assert.equal(t.split('\n')[0], '생성 시각: 2026-11-13 14:05 KST');
});
