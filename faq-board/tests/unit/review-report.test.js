import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSnapshotFixture } from '../helpers/snapshot-db.js';
import { buildReviewReport } from '../../src/review-report.js';
import { createBrokenDb } from '../helpers/pglite.js';

// 기준 시각: 2026-11-13 12:00 KST
const NOW = Date.UTC(2026, 10, 13, 3, 0);
const kst = (y, m, d, h = 12) => Date.UTC(y, m - 1, d, h - 9, 0);

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

function build(fx, opts = {}) {
  return buildReviewReport({ db: fx.db, now: NOW, ...opts });
}

test('답변 없는 질문은 경과 일수 큰 순으로 나온다', withFixture(async (fx) => {
  await fx.addQuestion({ title: '최근', createdAt: kst(2026, 11, 12) });
  await fx.addQuestion({ title: '오래됨', createdAt: kst(2026, 10, 1) });
  const { markdown, counts } = await build(fx);
  assert.equal(counts.unanswered, 2);
  assert.ok(markdown.indexOf('오래됨') < markdown.indexOf('최근'));
  assert.match(markdown, /\| \d+ \| PRGM0001 \| 2026-10-01 \| 43 \| 오래됨 \|/);
}));

test('답변 1년(365일) 이상은 오래된 답변, 364일은 제외 (KST 날짜 기준)', withFixture(async (fx) => {
  const old = await fx.addQuestion({ title: '오래된 답변' });
  await fx.addAnswer({ questionId: old, createdAt: kst(2025, 11, 13) }); // 365일 경과
  const fresh = await fx.addQuestion({ title: '최근 답변' });
  await fx.addAnswer({ questionId: fresh, createdAt: kst(2025, 11, 14) }); // 364일 경과
  const { markdown, counts } = await build(fx);
  assert.equal(counts.stale, 1);
  assert.match(markdown, /오래된 답변/);
  assert.doesNotMatch(markdown, /최근 답변/);
}));

test('KST 자정 경계: UTC로는 전날이어도 KST 날짜로 계산한다', withFixture(async (fx) => {
  const q = await fx.addQuestion({ title: '경계' });
  // 2025-11-13 00:30 KST = 2025-11-12 15:30 UTC → 365일 경과
  await fx.addAnswer({ questionId: q, createdAt: Date.UTC(2025, 10, 12, 15, 30) });
  assert.equal((await build(fx)).counts.stale, 1);
}));

test('여러 답변이 있으면 마지막 답변 기준으로 판단한다', withFixture(async (fx) => {
  const q = await fx.addQuestion({ title: '재답변' });
  await fx.addAnswer({ questionId: q, createdAt: kst(2024, 1, 1) });
  await fx.addAnswer({ questionId: q, createdAt: kst(2026, 11, 1) });
  const { counts } = await build(fx);
  assert.equal(counts.stale, 0);
  assert.equal(counts.unanswered, 0);
}));

test('staleDays 옵션을 바꿀 수 있다', withFixture(async (fx) => {
  const q = await fx.addQuestion({});
  await fx.addAnswer({ questionId: q, createdAt: kst(2026, 8, 1) });
  assert.equal((await build(fx)).counts.stale, 0);
}));

test('표준 형식: 제목, 생성 시각(KST), 기준, 요약, 두 섹션이 있다', withFixture(async (fx) => {
  const { markdown } = await build(fx);
  assert.match(markdown, /^# QnA 게시판 점검 보고서 2026-11-13/);
  assert.match(markdown, /생성 시각: 2026-11-13 12:00 KST/);
  assert.match(markdown, /## 1\. 요약/);
  assert.match(markdown, /## 2\. 답변 없는 질문/);
  assert.match(markdown, /## 3\. 오래된 답변/);
  assert.match(markdown, /없음/);
}));

test('작성자 사번·이름과 표 깨짐 문자는 보고서에 들어가지 않는다', withFixture(async (fx) => {
  const u = await fx.addUser('EMP7777', '비밀이름');
  await fx.addQuestion({ title: 'a|b\nc', authorId: u });
  const { markdown } = await build(fx);
  assert.doesNotMatch(markdown, /EMP7777|비밀이름/);
  assert.match(markdown, /a b c/);
}));

test('DB를 읽을 수 없으면 고정 문구로 실패한다', async () => {
  await assert.rejects(buildReviewReport({ db: createBrokenDb(), now: NOW }), /게시판 DB를 읽을 수 없습니다\./);
});
