import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { exportSnapshot } from '../../src/snapshot.js';
import { makeSnapshotFixture } from '../helpers/snapshot-db.js';

test('질문 1,000건·답변 3,000건을 60초 안에 내보내고 건수가 일치한다 (SC-004)', async () => {
  const fx = await makeSnapshotFixture();
  try {
    const u = await fx.defaultUser();
    await fx.db.exec(`
      INSERT INTO questions(program_id, title, body, author_id, created_at, form_token)
        SELECT 'PRGM0001', '질문 ' || g, '본문 ' || g, ${u}, 1000 + g, 'q-' || g FROM generate_series(1, 1000) g;
      INSERT INTO answers(question_id, body, author_id, created_at, form_token)
        SELECT q.id, '답변 ' || q.id || '-' || j, ${u}, 2000 + q.id, 'a-' || q.id || '-' || j
        FROM questions q, generate_series(1, 3) j;
    `);
    const t0 = Date.now();
    const r = await exportSnapshot({ db: fx.db, outPath: fx.outPath });
    assert.ok(Date.now() - t0 < 60_000);
    assert.deepEqual(r, { questions: 1000, answers: 3000 });
    const text = fs.readFileSync(fx.outPath, 'utf8');
    assert.equal((text.match(/^## 질문 /gm) ?? []).length, 1000);
    assert.equal((text.match(/^### 답변 \d+$/gm) ?? []).length, 3000);
  } finally {
    await fx.cleanup();
  }
});
