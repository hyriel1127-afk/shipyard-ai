import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, seedUser, loggedInClient, countRows, insertQuestion, insertAnswer } from '../helpers/server.js';

let app, c, qid;
test.before(async () => {
  app = await startApp();
  await seedUser(app, 'EMP0001', '홍길동', 'pw-1234', { answerer: true });
  c = await loggedInClient(app, 'EMP0001', 'pw-1234');
  const r = await c.ask({ program_id: 'PRGM0001', title: '제목', body: '내용' });
  qid = Number(r.location.split('/').pop());
});
test.after(() => app.close());

test('스키마에 태그·채택 열이 없다', async () => {
  for (const t of ['questions', 'answers']) {
    const cols = (await app.db.all('SELECT column_name FROM information_schema.columns WHERE table_name = $1', [t])).map((x) => x.column_name.toLowerCase());
    for (const name of cols) assert.ok(!/tag|accept|adopt|채택/.test(name), `${t}.${name}`);
  }
  const tables = (await app.db.all("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")).map((x) => x.table_name);
  assert.ok(!tables.some((n) => /tag/i.test(n)));
});

test('수정·삭제·내보내기 라우트가 없다', async () => {
  const before = (await countRows(app, 'questions'));
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
  assert.equal((await countRows(app, 'questions')), before);
});
