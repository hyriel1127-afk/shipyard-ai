import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { exportSnapshot } from '../../src/snapshot.js';
import { makeSnapshotFixture } from '../helpers/snapshot-db.js';

const TABLES = ['users', 'answerers', 'questions', 'answers', 'sessions', 'schema_migrations'];

function dumpAll(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return Object.fromEntries(
      TABLES.map((t) => [t, db.prepare(`SELECT * FROM ${t} ORDER BY 1`).all().map((r) => ({ ...r }))]),
    );
  } finally {
    db.close();
  }
}

const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function seed(fx) {
  const u = fx.addUser('EMP1', '작성자');
  fx.db.prepare('INSERT INTO answerers(emp_no) VALUES (?)').run('EMP1');
  fx.db
    .prepare('INSERT INTO sessions(token_hash, user_id, csrf_token, expires_at) VALUES (?, ?, ?, ?)')
    .run('h', u, 'c', Date.now() + 1000);
  const q = fx.addQuestion({ authorId: u });
  fx.addAnswer({ questionId: q, authorId: u });
}

test('내보내기 전후로 모든 테이블 내용이 같다 (SC-003)', () => {
  const fx = makeSnapshotFixture();
  try {
    seed(fx);
    fx.closeWriter();
    const before = dumpAll(fx.dbPath);
    exportSnapshot({ dbPath: fx.dbPath, outPath: fx.outPath });
    assert.deepEqual(dumpAll(fx.dbPath), before);
  } finally {
    fx.cleanup();
  }
});

test('DB 메인 파일의 크기·해시가 같고, 새로 생긴 -wal 파일은 비어 있다', () => {
  const fx = makeSnapshotFixture();
  try {
    seed(fx);
    fx.closeWriter();
    const wal = fx.dbPath + '-wal';
    const walBefore = fs.existsSync(wal);
    const sizeBefore = fs.statSync(fx.dbPath).size;
    const hashBefore = sha(fx.dbPath);
    exportSnapshot({ dbPath: fx.dbPath, outPath: fx.outPath });
    assert.equal(fs.statSync(fx.dbPath).size, sizeBefore);
    assert.equal(sha(fx.dbPath), hashBefore);
    // 읽기 전용 연결이 WAL 보조 파일을 만들 수는 있으나 데이터를 담지는 않는다.
    if (!walBefore && fs.existsSync(wal)) assert.equal(fs.statSync(wal).size, 0);
  } finally {
    fx.cleanup();
  }
});

test('마이그레이션이 안 된 빈 DB 파일을 주면 스키마를 만들지 않고 실패한다', () => {
  const fx = makeSnapshotFixture();
  try {
    const empty = fx.dir + '/empty.sqlite';
    fs.writeFileSync(empty, '');
    assert.throws(() => exportSnapshot({ dbPath: empty, outPath: fx.outPath }));
    assert.equal(fs.statSync(empty).size, 0);
    assert.ok(!fs.existsSync(fx.outPath));
  } finally {
    fx.cleanup();
  }
});

test('쓰기에 실패해도(부모 경로가 파일) DB 내용은 같다', () => {
  const fx = makeSnapshotFixture();
  try {
    seed(fx);
    fx.closeWriter();
    const before = dumpAll(fx.dbPath);
    const blocker = fx.dir + '/blocker';
    fs.writeFileSync(blocker, 'file');
    assert.throws(() => exportSnapshot({ dbPath: fx.dbPath, outPath: blocker + '/qna.md' }));
    assert.deepEqual(dumpAll(fx.dbPath), before);
  } finally {
    fx.cleanup();
  }
});
