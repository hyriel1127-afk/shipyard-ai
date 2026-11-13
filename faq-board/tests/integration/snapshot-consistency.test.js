import test from 'node:test';
import assert from 'node:assert/strict';
import { exportSnapshot } from '../../src/snapshot.js';
import { makeSnapshotFixture } from '../helpers/snapshot-db.js';

// 한 시점 일관성은 운영(Neon)에서 REPEATABLE READ 읽기 전용 트랜잭션이 보장한다.
// 메모리 DB(PGlite)는 연결이 하나라 트랜잭션 중간에 다른 쓰기를 끼워 넣을 수 없으므로,
// 여기서는 질문·답변 조회가 같은 트랜잭션 하나 안에서, 읽기 전용 설정 뒤에 일어나는지를 확인한다.
test('질문과 답변 조회가 하나의 읽기 전용 REPEATABLE READ 트랜잭션 안에서 일어난다', async () => {
  const fx = await makeSnapshotFixture();
  try {
    const q = await fx.addQuestion({ title: '기존 질문' });
    await fx.addAnswer({ questionId: q, body: '기존 답변' });
    const log = [];
    const spy = {
      ...fx.db,
      tx: (fn) =>
        fx.db.tx((t) => {
          log.push('BEGIN');
          return fn({
            ...t,
            exec: (sql) => (log.push(sql), t.exec(sql)),
            all: (sql, p) => (log.push(sql.trim().split(/\s+/).slice(0, 4).join(' ')), t.all(sql, p)),
          });
        }),
    };
    await exportSnapshot({ db: spy, outPath: fx.outPath });
    assert.deepEqual(log, [
      'BEGIN',
      'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY',
      'SELECT id, program_id, title,',
      'SELECT question_id, body, created_at',
    ]);
  } finally {
    await fx.cleanup();
  }
});
