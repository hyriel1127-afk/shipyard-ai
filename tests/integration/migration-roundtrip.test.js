import test from 'node:test';
import assert from 'node:assert/strict';
import { migrate } from '../../src/db.js';
import { createTestDb } from '../helpers/pglite.js';

const TABLES = ['users', 'answerers', 'questions', 'answers', 'sessions'];
const names = async (db) =>
  (await db.all("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")).map((r) => r.table_name);

test('up → 테이블 생성, down → 제거, 다시 up 성공', async () => {
  const db = await createTestDb({ migrated: false });
  try {
    await migrate(db, 'up');
    for (const t of [...TABLES, 'schema_migrations']) assert.ok((await names(db)).includes(t), t);
    await migrate(db, 'down');
    for (const t of TABLES) assert.ok(!(await names(db)).includes(t), t);
    await migrate(db, 'up');
    for (const t of TABLES) assert.ok((await names(db)).includes(t), t);
  } finally {
    await db.close();
  }
});

test('up 을 두 번 실행해도 안전하다(멱등)', async () => {
  const db = await createTestDb({ migrated: false });
  try {
    await migrate(db, 'up');
    await migrate(db, 'up');
    assert.equal((await db.get('SELECT COUNT(*)::int AS c FROM schema_migrations')).c, 1);
  } finally {
    await db.close();
  }
});

test('questions.program_id 는 NULL·빈 문자열·형식 오류를 DB 에서도 거부한다', async () => {
  const db = await createTestDb();
  try {
    await db.run("INSERT INTO users(emp_no, name, password_hash) VALUES ('E1', 'n', 'h')");
    const ins = (pid, token) =>
      db.run('INSERT INTO questions(program_id, title, body, author_id, created_at, form_token) VALUES ($1, $2, $3, 1, 1, $4)', [pid, 't', 'b', token]);
    await assert.rejects(ins(null, 'a'));
    await assert.rejects(ins('', 'b'));
    await assert.rejects(ins('prg 1', 'c'));
    await ins('PRGM0001', 'd');
    await ins('PRGM0001A', 'e');
  } finally {
    await db.close();
  }
});
