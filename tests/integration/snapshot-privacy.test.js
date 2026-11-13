import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { exportSnapshot } from '../../src/snapshot.js';
import { makeSnapshotFixture } from '../helpers/snapshot-db.js';

test('작성자 이름·사번이 파일 어디에도 없다 (SC-002)', () => {
  const fx = makeSnapshotFixture();
  try {
    const u1 = fx.addUser('EMP7001', '비밀작성자가');
    const u2 = fx.addUser('EMP7002', '비밀작성자나');
    const q = fx.addQuestion({ title: '일반 제목', body: '일반 본문', authorId: u1 });
    fx.addAnswer({ questionId: q, body: '일반 답변', authorId: u2 });
    exportSnapshot({ dbPath: fx.dbPath, outPath: fx.outPath });
    const text = fs.readFileSync(fx.outPath, 'utf8');
    for (const secret of ['EMP7001', 'EMP7002', '비밀작성자가', '비밀작성자나']) {
      assert.ok(!text.includes(secret), `${secret} 가 파일에 있음`);
    }
    assert.match(text, /일반 본문/);
    assert.match(text, /일반 답변/);
  } finally {
    fx.cleanup();
  }
});

test('본문·제목에 사용자가 직접 쓴 이름은 가공하지 않고 그대로 낸다', () => {
  const fx = makeSnapshotFixture();
  try {
    fx.addQuestion({ title: '홍길동님께 문의', body: '홍길동 사번 X123 확인 부탁' });
    exportSnapshot({ dbPath: fx.dbPath, outPath: fx.outPath });
    const text = fs.readFileSync(fx.outPath, 'utf8');
    assert.ok(text.includes('> 홍길동님께 문의'));
    assert.ok(text.includes('> 홍길동 사번 X123 확인 부탁'));
  } finally {
    fx.cleanup();
  }
});

test('src/snapshot.js는 작성자 컬럼과 users를 조회하지 않는다', () => {
  const src = fs.readFileSync(new URL('../../src/snapshot.js', import.meta.url), 'utf8');
  const sqls = src.match(/SELECT[\s\S]*?(?=['"`]\))/g) ?? [];
  assert.ok(sqls.length >= 2);
  for (const sql of sqls) {
    assert.doesNotMatch(sql, /author_id|users|emp_no|\bname\b|\*/i);
  }
  assert.doesNotMatch(src, /SELECT\s+\*/i);
});
