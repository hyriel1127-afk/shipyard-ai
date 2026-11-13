import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { exportSnapshot } from '../../src/snapshot.js';
import { makeSnapshotFixture } from '../helpers/snapshot-db.js';

const TABLES = ['users', 'answerers', 'questions', 'answers', 'sessions', 'schema_migrations'];

async function dumpAll(db) {
  return Object.fromEntries(await Promise.all(TABLES.map(async (t) => [t, await db.all(`SELECT * FROM ${t} ORDER BY 1`)])));
}

async function seed(fx) {
  const u = await fx.addUser('EMP1', '작성자');
  await fx.db.run('INSERT INTO answerers(emp_no) VALUES ($1)', ['EMP1']);
  await fx.db.run('INSERT INTO sessions(token_hash, user_id, csrf_token, expires_at) VALUES ($1, $2, $3, $4)', ['h', u, 'c', Date.now() + 1000]);
  const q = await fx.addQuestion({ authorId: u });
  await fx.addAnswer({ questionId: q, authorId: u });
}

test('내보내기 전후로 모든 테이블 내용이 같다 (SC-003)', async () => {
  const fx = await makeSnapshotFixture();
  try {
    await seed(fx);
    const before = await dumpAll(fx.db);
    await exportSnapshot({ db: fx.db, outPath: fx.outPath });
    assert.deepEqual(await dumpAll(fx.db), before);
  } finally {
    await fx.cleanup();
  }
});

test('읽기 전용 트랜잭션에서는 쓰기가 DB 에서 거부된다', async () => {
  const fx = await makeSnapshotFixture();
  try {
    await seed(fx);
    await assert.rejects(
      fx.db.tx(async (t) => {
        await t.exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
        await t.run("INSERT INTO answerers(emp_no) VALUES ('X')");
      }),
    );
    assert.equal((await fx.db.get('SELECT COUNT(*)::int AS c FROM answerers')).c, 1);
  } finally {
    await fx.cleanup();
  }
});

test('마이그레이션이 안 된 DB 면 스키마를 만들지 않고 DB_READ 로 실패한다', async () => {
  const fx = await makeSnapshotFixture({ migrated: false });
  try {
    await assert.rejects(exportSnapshot({ db: fx.db, outPath: fx.outPath }), (e) => e.code === 'DB_READ');
    const tables = await fx.db.all("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    assert.deepEqual(tables, []);
    assert.ok(!fs.existsSync(fx.outPath));
  } finally {
    await fx.cleanup();
  }
});

test('쓰기에 실패해도(부모 경로가 파일) DB 내용은 같다', async () => {
  const fx = await makeSnapshotFixture();
  try {
    await seed(fx);
    const before = await dumpAll(fx.db);
    const blocker = fx.dir + '/blocker';
    fs.writeFileSync(blocker, 'file');
    await assert.rejects(exportSnapshot({ db: fx.db, outPath: blocker + '/qna.md' }));
    assert.deepEqual(await dumpAll(fx.db), before);
  } finally {
    await fx.cleanup();
  }
});
