import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeSnapshotFixture } from '../helpers/snapshot-db.js';

const SCRIPT = new URL('../../scripts/export-snapshot.js', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');

function run(env) {
  return spawnSync(process.execPath, [SCRIPT], { env: { ...process.env, ...env }, encoding: 'utf8' });
}

function withFixture(fn) {
  return () => {
    const fx = makeSnapshotFixture();
    try {
      fn(fx);
    } finally {
      fx.cleanup();
    }
  };
}

test('성공: 종료 코드 0과 건수 메시지', withFixture((fx) => {
  const q = fx.addQuestion({});
  fx.addAnswer({ questionId: q });
  fx.closeWriter();
  const r = run({ QNA_DB: fx.dbPath, QNA_SNAPSHOT_PATH: fx.outPath });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /스냅샷을 만들었습니다\. 질문 1건, 답변 1건/);
  assert.ok(fs.existsSync(fx.outPath));
}));

test('질문 0건: 종료 코드 0과 안내 메시지', withFixture((fx) => {
  fx.closeWriter();
  const r = run({ QNA_DB: fx.dbPath, QNA_SNAPSHOT_PATH: fx.outPath });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /스냅샷을 만들었습니다\. 내보낼 질문이 없습니다/);
}));

test('DB 없음: 종료 코드 1, 고정 문구, 기존 스냅샷 유지, 경로·원문 미노출', withFixture((fx) => {
  fs.mkdirSync(path.dirname(fx.outPath), { recursive: true });
  fs.writeFileSync(fx.outPath, 'KEEP\n');
  const r = run({ QNA_DB: path.join(fx.dir, 'none.sqlite'), QNA_SNAPSHOT_PATH: fx.outPath });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /게시판 DB를 읽을 수 없습니다\./);
  assert.ok(!r.stderr.includes(fx.dir));
  assert.doesNotMatch(r.stderr, /\bat .*\(|\.js:\d+/);
  assert.equal(fs.readFileSync(fx.outPath, 'utf8'), 'KEEP\n');
}));

test('쓰기 실패: 종료 코드 1, 고정 문구, 개인정보·경로 미노출', withFixture((fx) => {
  const u = fx.addUser('EMP8001', '비밀이름가가');
  fx.addQuestion({ title: '비밀제목XYZ', body: '비밀본문XYZ', authorId: u });
  fx.closeWriter();
  const blocker = path.join(fx.dir, 'blocker');
  fs.writeFileSync(blocker, 'file');
  const r = run({ QNA_DB: fx.dbPath, QNA_SNAPSHOT_PATH: path.join(blocker, 'qna.md') });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /스냅샷 파일을 쓸 수 없습니다\./);
  for (const secret of ['EMP8001', '비밀이름가가', '비밀제목XYZ', '비밀본문XYZ', fx.dir]) {
    assert.ok(!r.stderr.includes(secret) && !r.stdout.includes(secret), `${secret} 노출`);
  }
}));
