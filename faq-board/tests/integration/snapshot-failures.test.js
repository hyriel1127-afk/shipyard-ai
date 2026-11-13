import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { exportSnapshot } from '../../src/snapshot.js';
import { makeSnapshotFixture } from '../helpers/snapshot-db.js';
import { createBrokenDb } from '../helpers/pglite.js';

const NOW = Date.UTC(2026, 10, 13, 5, 5);

function withFixture(fn) {
  return async () => {
    const fx = await makeSnapshotFixture();
    try {
      await fn(fx);
    } finally {
      await fx.cleanup();
    }
  };
}

test('질문 0건이면 생성 시각 줄과 안내 문구뿐이다 (SC-005)', withFixture(async (fx) => {
  const r = await exportSnapshot({ db: fx.db, outPath: fx.outPath, now: NOW });
  assert.deepEqual(r, { questions: 0, answers: 0 });
  assert.equal(fs.readFileSync(fx.outPath, 'utf8'), '생성 시각: 2026-11-13 14:05 KST\n\n내보낼 질문이 없습니다\n');
}));

test('이전 스냅샷에 질문이 있었어도 0건 파일로 대체된다', withFixture(async (fx) => {
  fs.mkdirSync(path.dirname(fx.outPath), { recursive: true });
  fs.writeFileSync(fx.outPath, '## 질문 1\n예전 질문 OLD\n');
  await exportSnapshot({ db: fx.db, outPath: fx.outPath, now: NOW });
  const text = fs.readFileSync(fx.outPath, 'utf8');
  assert.ok(!text.includes('OLD'));
  assert.match(text, /내보낼 질문이 없습니다/);
}));

test('출력 폴더가 없으면 만들고 성공한다 (SC-006)', withFixture(async (fx) => {
  await fx.addQuestion({});
  assert.ok(!fs.existsSync(path.dirname(fx.outPath)));
  await exportSnapshot({ db: fx.db, outPath: fx.outPath, now: NOW });
  assert.ok(fs.existsSync(fx.outPath));
}));

test('DB 파일이 없으면 DB_READ 오류를 던지고 출력 폴더·파일을 만들지 않는다', withFixture(async (fx) => {
  await assert.rejects(
    exportSnapshot({ db: createBrokenDb(), outPath: fx.outPath }),
    (e) => e.code === 'DB_READ',
  );
  assert.ok(!fs.existsSync(path.dirname(fx.outPath)));
}));

test('DB가 없어도 기존 스냅샷은 그대로다', withFixture(async (fx) => {
  fs.mkdirSync(path.dirname(fx.outPath), { recursive: true });
  fs.writeFileSync(fx.outPath, 'KEEP-ME\n');
  await assert.rejects(exportSnapshot({ db: createBrokenDb(), outPath: fx.outPath }));
  assert.equal(fs.readFileSync(fx.outPath, 'utf8'), 'KEEP-ME\n');
}));

test('폴더를 만들 수 없으면(부모가 파일) WRITE 오류를 던진다', withFixture(async (fx) => {
  await fx.addQuestion({});
  const blocker = path.join(fx.dir, 'blocker');
  fs.writeFileSync(blocker, 'file');
  await assert.rejects(
    exportSnapshot({ db: fx.db, outPath: path.join(blocker, 'qna.md') }),
    (e) => e.code === 'WRITE',
  );
}));

test('교체에 실패해도 기존 스냅샷이 남고 임시 파일이 없다', withFixture(async (fx) => {
  await fx.addQuestion({});
  // qna.md 자리에 디렉터리가 있어 rename이 실패한다. 그 안의 파일로 존재를 확인한다.
  fs.mkdirSync(fx.outPath, { recursive: true });
  fs.writeFileSync(path.join(fx.outPath, 'keep.txt'), 'KEEP');
  await assert.rejects(
    exportSnapshot({ db: fx.db, outPath: fx.outPath }),
    (e) => e.code === 'WRITE',
  );
  assert.equal(fs.readFileSync(path.join(fx.outPath, 'keep.txt'), 'utf8'), 'KEEP');
  assert.deepEqual(fs.readdirSync(path.dirname(fx.outPath)).filter((n) => n.includes('.tmp-')), []);
}));
