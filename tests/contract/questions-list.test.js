import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, seedUser, loggedInClient } from '../helpers/server.js';

let app, client;

test.before(async () => {
  app = await startApp({ programs: ['PRGM0001', 'PRGM0002'] });
  seedUser(app, 'EMP7731', '홍길동', 'pw-1234');
  client = await loggedInClient(app, 'EMP7731', 'pw-1234');
});
test.after(() => app.close());

function rows(text) {
  return [...text.matchAll(/<tr data-question-id="(\d+)">([\s\S]*?)<\/tr>/g)].map((m) => ({ id: Number(m[1]), html: m[2] }));
}

test('기본 목록: 제목(상세 링크)·프로그램 ID·작성일(KST)·답변 수가 행에 표시되고 최신순이다', async () => {
  const a = await client.ask({ program_id: 'PRGM0001', title: '첫 번째 질문', body: '내용' });
  const b = await client.ask({ program_id: 'PRGM0002', title: '두 번째 질문', body: '내용' });
  assert.equal(a.status, 303);
  assert.equal(b.status, 303);

  const r = await client.get('/');
  assert.equal(r.status, 200);
  const list = rows(r.text);
  assert.equal(list.length, 2);
  assert.ok(list[0].html.includes('두 번째 질문'), '최신 질문이 맨 위');
  assert.ok(list[1].html.includes('첫 번째 질문'));
  const id0 = a.location.split('/').pop();
  assert.ok(list[1].html.includes(`href="/questions/${id0}"`));
  assert.match(list[0].html, /class="program-id">PRGM0002</);
  assert.match(list[1].html, /class="program-id">PRGM0001</);
  assert.match(list[0].html, /class="created-at">\d{4}-\d{2}-\d{2} \d{2}:\d{2}</);
  assert.match(list[0].html, /class="answer-count">0</);
});
