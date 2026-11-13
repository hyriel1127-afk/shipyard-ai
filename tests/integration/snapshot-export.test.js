import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { exportSnapshot } from '../../src/snapshot.js';
import { makeSnapshotFixture } from '../helpers/snapshot-db.js';

const NOW = Date.UTC(2026, 10, 13, 5, 5);
const read = (fx) => fs.readFileSync(fx.outPath, 'utf8');
const count = (text, re) => (text.match(re) ?? []).length;

function withFixture(fn) {
  return async () => {
    const fx = makeSnapshotFixture();
    try {
      await fn(fx);
    } finally {
      fx.cleanup();
    }
  };
}

test('질문 수·답변 수가 DB와 일치한다 (SC-001)', withFixture((fx) => {
  const q1 = fx.addQuestion({ title: '첫째' });
  const q2 = fx.addQuestion({ title: '둘째' });
  fx.addQuestion({ title: '셋째' });
  fx.addAnswer({ questionId: q1 });
  fx.addAnswer({ questionId: q1 });
  fx.addAnswer({ questionId: q2 });
  const r = exportSnapshot({ dbPath: fx.dbPath, outPath: fx.outPath, now: NOW });
  assert.deepEqual(r, { questions: 3, answers: 3 });
  const text = read(fx);
  assert.equal(count(text, /^## 질문 /gm), 3);
  assert.equal(count(text, /^### 답변 \d+$/gm), 3);
}));

test('질문은 번호 오름차순, 답변은 등록 순이다', withFixture((fx) => {
  const q1 = fx.addQuestion({ title: 'Q-하나' });
  const q2 = fx.addQuestion({ title: 'Q-둘' });
  fx.addAnswer({ questionId: q1, body: 'A-먼저' });
  fx.addAnswer({ questionId: q1, body: 'A-나중', createdAt: Date.UTC(2026, 10, 12, 1, 0) });
  exportSnapshot({ dbPath: fx.dbPath, outPath: fx.outPath, now: NOW });
  const text = read(fx);
  assert.ok(text.indexOf(`## 질문 ${q1}`) < text.indexOf(`## 질문 ${q2}`));
  assert.ok(text.indexOf('A-먼저') < text.indexOf('A-나중'));
}));

test('답변 없는 질문도 포함되고 "답변 없음"이 표시된다', withFixture((fx) => {
  fx.addQuestion({ title: '무응답' });
  exportSnapshot({ dbPath: fx.dbPath, outPath: fx.outPath, now: NOW });
  const text = read(fx);
  assert.match(text, /^## 질문 1$/m);
  assert.match(text, /^### 답변 없음$/m);
}));

test('본문의 마크다운 경계 문자·이모지·긴 본문이 있어도 항목 경계가 깨지지 않고 원문이 보존된다', withFixture((fx) => {
  const long = '가'.repeat(4000);
  fx.addQuestion({ title: '😀 제목', body: '## 질문 99\n---\n```js\nx\n```\n😀' });
  fx.addQuestion({ title: '긴 본문', body: long });
  exportSnapshot({ dbPath: fx.dbPath, outPath: fx.outPath, now: NOW });
  const text = read(fx);
  assert.equal(count(text, /^## 질문 /gm), 2);
  assert.ok(text.includes('> ## 질문 99\n> ---\n> ```js\n> x\n> ```\n> 😀'));
  assert.ok(text.includes(`> ${long}`));
  assert.ok(text.includes('> 😀 제목'));
}));

test('이미 있는 qna.md를 새 내용으로 완전히 대체한다', withFixture((fx) => {
  fs.mkdirSync(path.dirname(fx.outPath), { recursive: true });
  fs.writeFileSync(fx.outPath, '예전 내용 OLD-MARKER\n');
  fx.addQuestion({ title: '새 질문' });
  exportSnapshot({ dbPath: fx.dbPath, outPath: fx.outPath, now: NOW });
  const text = read(fx);
  assert.ok(!text.includes('OLD-MARKER'));
  assert.match(text, /새 질문/);
}));

test('같은 DB로 두 번 내보내면 생성 시각 줄을 뺀 내용이 같다 (SC-008)', withFixture((fx) => {
  const q = fx.addQuestion({ title: '반복' });
  fx.addAnswer({ questionId: q });
  exportSnapshot({ dbPath: fx.dbPath, outPath: fx.outPath, now: NOW });
  const a = read(fx);
  exportSnapshot({ dbPath: fx.dbPath, outPath: fx.outPath, now: NOW + 3 * 3600 * 1000 });
  const b = read(fx);
  assert.notEqual(a.split('\n')[0], b.split('\n')[0]);
  assert.equal(a.split('\n').slice(1).join('\n'), b.split('\n').slice(1).join('\n'));
}));
