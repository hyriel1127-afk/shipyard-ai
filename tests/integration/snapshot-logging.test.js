import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { exportSnapshot } from '../../src/snapshot.js';
import { setSink } from '../../src/logger.js';
import { makeSnapshotFixture } from '../helpers/snapshot-db.js';

function capture(fn) {
  const lines = [];
  setSink((l) => lines.push(l));
  try {
    fn();
  } catch {}
  finally {
    setSink(null);
  }
  return lines;
}

test('성공·실패 로그에 사번·이름·제목·본문·경로가 없고 허용 필드만 있다', () => {
  const fx = makeSnapshotFixture();
  try {
    const u = fx.addUser('EMP9101', '로그비밀이름');
    const q = fx.addQuestion({ title: '로그비밀제목', body: '로그비밀본문', authorId: u });
    fx.addAnswer({ questionId: q, body: '로그비밀답변', authorId: u });
    fx.closeWriter();
    const blocker = path.join(fx.dir, 'blocker');
    fs.writeFileSync(blocker, 'f');
    const lines = [
      ...capture(() => exportSnapshot({ dbPath: fx.dbPath, outPath: fx.outPath })),
      ...capture(() => exportSnapshot({ dbPath: path.join(fx.dir, 'none.sqlite'), outPath: fx.outPath })),
      ...capture(() => exportSnapshot({ dbPath: fx.dbPath, outPath: path.join(blocker, 'qna.md') })),
    ];
    assert.equal(lines.length, 3);
    const all = lines.join('\n');
    for (const secret of ['EMP9101', '로그비밀이름', '로그비밀제목', '로그비밀본문', '로그비밀답변', fx.dir]) {
      assert.ok(!all.includes(secret), `${secret} 로그에 있음`);
    }
    const parsed = lines.map((l) => JSON.parse(l));
    assert.deepEqual(parsed.map((p) => p.result), ['ok', 'fail', 'fail']);
    for (const p of parsed) {
      assert.equal(p.event, 'snapshot_export');
      assert.deepEqual(Object.keys(p).sort(), ['at', 'event', 'result']);
    }
  } finally {
    fx.cleanup();
  }
});
