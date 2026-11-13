import test from 'node:test';
import assert from 'node:assert/strict';
import { renderSnapshot } from '../../src/snapshot.js';

// 2026-11-13 05:05:30 UTC = 2026-11-13 14:05 KST
const NOW = Date.UTC(2026, 10, 13, 5, 5, 30);
const Q = (o) => ({ id: 12, program_id: 'ABCD1234', title: '제목', body: '본문', created_at: Date.UTC(2026, 10, 13, 0, 30), ...o });
const A = (o) => ({ question_id: 12, body: '답변', created_at: Date.UTC(2026, 10, 13, 1, 0), ...o });

test('첫 줄은 생성 시각(KST), 빈 줄 뒤에 제목이 온다', () => {
  const lines = renderSnapshot([Q()], [], NOW).split('\n');
  assert.equal(lines[0], '생성 시각: 2026-11-13 14:05 KST');
  assert.equal(lines[1], '');
  assert.equal(lines[2], '# QnA 스냅샷');
});

test('질문 항목에 번호·프로그램 ID·등록일·제목·본문이 계약대로 들어간다', () => {
  const out = renderSnapshot([Q({ title: '로그인이 안 됩니다', body: '첫 줄\n둘째 줄' })], [], NOW);
  assert.match(out, /^## 질문 12$/m);
  assert.match(out, /^- 프로그램 ID: ABCD1234$/m);
  assert.match(out, /^- 질문 등록일: 2026-11-13 09:30$/m);
  assert.match(out, /^- 제목:\n> 로그인이 안 됩니다$/m);
  assert.match(out, /^- 본문:\n> 첫 줄\n> 둘째 줄$/m);
});

test('본문의 빈 줄은 ">"만, CRLF도 줄로 나뉜다', () => {
  const out = renderSnapshot([Q({ body: 'a\r\n\r\nb' })], [], NOW);
  assert.match(out, /^- 본문:\n> a\n>\n> b$/m);
});

test('본문 속 "## 질문 99"·"---"는 항목 경계가 되지 않는다', () => {
  const out = renderSnapshot([Q({ body: '## 질문 99\n---\n```' })], [], NOW);
  assert.equal(out.split('\n').filter((l) => l.startsWith('## 질문 ')).length, 1);
  assert.match(out, /^> ## 질문 99$/m);
});

test('답변은 번호와 등록일, 본문이 들어가고 등록 순으로 나열된다', () => {
  const out = renderSnapshot([Q()], [A({ body: '첫 답' }), A({ body: '둘째 답\n줄2', created_at: Date.UTC(2026, 10, 13, 2, 0) })], NOW);
  assert.match(out, /^### 답변 1$/m);
  assert.match(out, /^### 답변 2$/m);
  assert.match(out, /### 답변 1\n\n- 답변 등록일: 2026-11-13 10:00\n- 본문:\n> 첫 답/);
  assert.match(out, /### 답변 2\n\n- 답변 등록일: 2026-11-13 11:00\n- 본문:\n> 둘째 답\n> 줄2/);
  assert.ok(out.indexOf('첫 답') < out.indexOf('둘째 답'));
  assert.doesNotMatch(out, /답변 없음/);
});

test('답변이 없으면 "### 답변 없음"', () => {
  const out = renderSnapshot([Q()], [], NOW);
  assert.match(out, /^### 답변 없음$/m);
});

test('답변은 자기 질문에만 붙는다', () => {
  const out = renderSnapshot([Q({ id: 1 }), Q({ id: 2 })], [A({ question_id: 2, body: '둘의답' })], NOW);
  const [first, second] = out.split(/^## 질문 /m).slice(1);
  assert.match(first, /답변 없음/);
  assert.match(second, /둘의답/);
});

test('질문 0건: 생성 시각 줄, 빈 줄, 안내 문구뿐이다', () => {
  assert.equal(renderSnapshot([], [], NOW), '생성 시각: 2026-11-13 14:05 KST\n\n내보낼 질문이 없습니다\n');
});

test('질문이 있으면 파일은 줄바꿈으로 끝난다', () => {
  assert.ok(renderSnapshot([Q()], [], NOW).endsWith('\n'));
});
