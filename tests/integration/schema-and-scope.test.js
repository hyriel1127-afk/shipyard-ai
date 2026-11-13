import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, seedUser, loggedInClient } from '../helpers/server.js';

let app, c, qid;
test.before(async () => {
  app = await startApp();
  seedUser(app, 'EMP0001', '홍길동', 'pw-1234', { answerer: true });
  c = await loggedInClient(app, 'EMP0001', 'pw-1234');
  const r = await c.ask({ program_id: 'PRGM0001', title: '제목', body: '내용' });
  qid = Number(r.location.split('/').pop());
});
test.after(() => app.close());

test('스키마에 태그·채택 열이 없다', () => {
  for (const t of ['questions', 'answers']) {
    const cols = app.db.prepare(`PRAGMA table_info(${t})`).all().map((x) => x.name.toLowerCase());
    for (const name of cols) assert.ok(!/tag|accept|adopt|채택/.test(name), `${t}.${name}`);
  }
  const tables = app.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((x) => x.name);
  assert.ok(!tables.some((n) => /tag/i.test(n)));
});

test('수정·삭제·내보내기 라우트가 없다', async () => {
  const before = app.db.prepare('SELECT COUNT(*) c FROM questions').get().c;
  const attempts = [
    ['GET', `/questions/${qid}/edit`], ['GET', `/questions/${qid}/delete`], ['GET', '/export'], ['GET', '/questions.csv'],
    ['POST', `/questions/${qid}/edit`], ['POST', `/questions/${qid}/delete`], ['POST', `/questions/${qid}`],
    ['PUT', `/questions/${qid}`], ['PATCH', `/questions/${qid}`], ['DELETE', `/questions/${qid}`],
    ['POST', '/questions/1/answers/1/delete'], ['DELETE', '/questions/1/answers/1'], ['POST', `/questions/${qid}/accept`],
  ];
  for (const [m, p] of attempts) {
    const r = await c.request(m, p, m === 'GET' || m === 'DELETE' ? undefined : { csrf: await c.csrfToken() });
    assert.ok([404, 405].includes(r.status), `${m} ${p} → ${r.status}`);
  }
  assert.equal(app.db.prepare('SELECT COUNT(*) c FROM questions').get().c, before);
});
