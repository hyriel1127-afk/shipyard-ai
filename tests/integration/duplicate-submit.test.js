import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, seedUser, loggedInClient, countRows, insertQuestion, insertAnswer } from '../helpers/server.js';

let app, client;
const count = () => countRows(app, 'questions');
const fields = (token) => ({ form_token: token, program_id: 'PRGM0001', title: '중복 제출', body: '내용' });

test.before(async () => {
  app = await startApp();
  await seedUser(app, 'EMP7731', '홍길동', 'pw-1234');
  client = await loggedInClient(app, 'EMP7731', 'pw-1234');
});
test.after(() => app.close());

test('같은 form_token 으로 두 번 보내도 1건만 저장되고 같은 상세로 이동한다', async () => {
  const token = await client.newFormToken();
  const a = await client.post('/questions', fields(token));
  const b = await client.post('/questions', fields(token));
  assert.equal(a.status, 303);
  assert.equal(b.status, 303);
  assert.equal(a.location, b.location);
  assert.equal((await count()), 1);
});
test('동시에 두 번 보내도 1건만 저장된다', async () => {
  const token = await client.newFormToken();
  const [a, b] = await Promise.all([client.post('/questions', fields(token)), client.post('/questions', fields(token))]);
  assert.equal(a.status, 303);
  assert.equal(b.status, 303);
  assert.equal(a.location, b.location);
  assert.equal((await count()), 2);
});
test('검증 실패(400) 후 같은 토큰으로 고쳐서 다시 보내면 성공한다', async () => {
  const token = await client.newFormToken();
  const bad = await client.post('/questions', { ...fields(token), program_id: 'PRGM9999' });
  assert.equal(bad.status, 400);
  assert.ok(bad.text.includes(token), '400 재렌더링에 같은 토큰이 유지되어야 한다');
  const ok = await client.post('/questions', fields(token));
  assert.equal(ok.status, 303);
  assert.equal((await count()), 3);
});
