import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb, migrate } from '../../src/db.js';

const TABLES = ['users', 'answerers', 'questions', 'answers', 'sessions'];
const names = (db) =>
  db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);

test('up → 테이블 생성, down → 제거, 다시 up 성공', () => {
  const db = openDb(':memory:');
  migrate(db, 'up');
  for (const t of [...TABLES, 'schema_migrations']) assert.ok(names(db).includes(t), t);
  migrate(db, 'down');
  for (const t of TABLES) assert.ok(!names(db).includes(t), t);
  migrate(db, 'up');
  for (const t of TABLES) assert.ok(names(db).includes(t), t);
});
test('questions.program_id 는 NULL·빈 문자열·형식 오류를 DB 에서도 거부한다', () => {
  const db = openDb(':memory:');
  migrate(db, 'up');
  db.prepare("INSERT INTO users(emp_no, name, password_hash) VALUES ('E1', 'n', 'h')").run();
  const ins = (pid, token) =>
    db
      .prepare('INSERT INTO questions(program_id, title, body, author_id, created_at, form_token) VALUES (?, ?, ?, 1, 1, ?)')
      .run(pid, 't', 'b', token);
  assert.throws(() => ins(null, 'a'));
  assert.throws(() => ins('', 'b'));
  assert.throws(() => ins('prg 1', 'c'));
  ins('PRGM0001', 'd');
  ins('PRGM0001A', 'e');
});
