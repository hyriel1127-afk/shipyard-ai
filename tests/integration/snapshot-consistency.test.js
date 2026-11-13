import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { exportSnapshot } from '../../src/snapshot.js';
import { makeSnapshotFixture } from '../helpers/snapshot-db.js';

test('질문 조회와 답변 조회 사이에 새 글이 올라와도 한 시점의 내용만 담긴다', () => {
  const fx = makeSnapshotFixture();
  try {
    const q1 = fx.addQuestion({ title: '기존 질문' });
    fx.addAnswer({ questionId: q1, body: '기존 답변' });
    // 쓰기 연결(fx.db)을 열어 둔 채로 내보낸다. 질문 조회 직후 새 질문과 새 답변을 넣는다.
    let injected = false;
    const r = exportSnapshot({
      dbPath: fx.dbPath,
      outPath: fx.outPath,
      afterQuestionsRead() {
        injected = true;
        const q2 = fx.addQuestion({ title: '끼어든 질문' });
        fx.addAnswer({ questionId: q2, body: '끼어든 답변' });
        fx.addAnswer({ questionId: q1, body: '기존 질문에 끼어든 답변' });
      },
    });
    assert.ok(injected, '훅이 호출되어야 한다');
    const text = fs.readFileSync(fx.outPath, 'utf8');
    assert.deepEqual(r, { questions: 1, answers: 1 });
    assert.match(text, /기존 질문/);
    assert.match(text, /기존 답변/);
    assert.doesNotMatch(text, /끼어든/);
    // 다음 실행에는 모두 반영된다
    exportSnapshot({ dbPath: fx.dbPath, outPath: fx.outPath });
    const next = fs.readFileSync(fx.outPath, 'utf8');
    assert.match(next, /끼어든 질문/);
    assert.match(next, /기존 질문에 끼어든 답변/);
  } finally {
    fx.cleanup();
  }
});
