import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { exportSnapshot } from '../../src/snapshot.js';
import { makeSnapshotFixture } from '../helpers/snapshot-db.js';

test('질문 1,000건·답변 3,000건을 60초 안에 내보내고 건수가 일치한다 (SC-004)', () => {
  const fx = makeSnapshotFixture();
  try {
    const u = fx.defaultUser();
    fx.db.exec('BEGIN');
    for (let i = 0; i < 1000; i++) {
      const q = fx.addQuestion({ title: `질문 ${i}`, body: `본문 ${i}`, authorId: u });
      for (let j = 0; j < 3; j++) fx.addAnswer({ questionId: q, body: `답변 ${i}-${j}`, authorId: u });
    }
    fx.db.exec('COMMIT');
    fx.closeWriter();
    const t0 = Date.now();
    const r = exportSnapshot({ dbPath: fx.dbPath, outPath: fx.outPath });
    assert.ok(Date.now() - t0 < 60_000);
    assert.deepEqual(r, { questions: 1000, answers: 3000 });
    const text = fs.readFileSync(fx.outPath, 'utf8');
    assert.equal((text.match(/^## 질문 /gm) ?? []).length, 1000);
    assert.equal((text.match(/^### 답변 \d+$/gm) ?? []).length, 3000);
  } finally {
    fx.cleanup();
  }
});
