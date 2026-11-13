import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, seedUser, captureLogs, Client, countRows, insertQuestion, insertAnswer } from '../helpers/server.js';

// 변경된 요구: 읽기(목록·필터·상세)는 로그인 없이 가능, 로그인 제한은 쓰기(질문 작성·답변)에만 적용.
let app, qid, logs;
const count = () => countRows(app, 'questions');

test.before(async () => {
  app = await startApp({ programs: ['PRGM0001', 'PRGM0002'] });
  const uid = await seedUser(app, 'EMP7731', '홍길동', 'pw-1234');
  qid = await insertQuestion(app, 'PRGM0001', '공개 질문 A', '본문 A', uid, Date.now(), 't-pub-1');
  await insertQuestion(app, 'PRGM0002', '공개 질문 B', '본문 B', uid, Date.now(), 't-pub-2');
  logs = captureLogs();
});
test.after(async () => {
  logs.restore();
  await app.close();
});

test('미로그인: 목록은 200 이고 질문이 보인다', async () => {
  const r = await new Client(app).get('/');
  assert.equal(r.status, 200);
  assert.ok(r.text.includes('공개 질문 A') && r.text.includes('공개 질문 B'));
});

test('미로그인: 프로그램 ID 필터가 동작한다', async () => {
  const r = await new Client(app).get('/?program_id=PRGM0002');
  assert.equal(r.status, 200);
  assert.ok(r.text.includes('공개 질문 B'));
  assert.ok(!r.text.includes('공개 질문 A'));
});

test('미로그인: 상세는 200 이고 내용이 보인다', async () => {
  const r = await new Client(app).get(`/questions/${qid}`);
  assert.equal(r.status, 200);
  assert.ok(r.text.includes('공개 질문 A') && r.text.includes('본문 A'));
});

test('미로그인: 없는 질문은 401 이 아니라 404', async () => {
  const r = await new Client(app).get('/questions/99999');
  assert.equal(r.status, 404);
  assert.ok(r.text.includes('존재하지 않는 질문입니다.'));
});

test('미로그인 화면: 로그인 링크가 보이고 로그아웃·CSRF 토큰은 없다', async () => {
  const r = await new Client(app).get('/');
  assert.ok(r.text.includes('href="/login"'));
  assert.ok(!r.text.includes('action="/logout"'));
  assert.ok(!r.text.includes('name="csrf"'));
});

test('미로그인: 읽기 요청은 auth.required 로그를 남기지 않는다', async () => {
  const c = new Client(app);
  const before = logs.lines().filter((l) => l.event === 'auth.required').length;
  await c.get('/');
  await c.get(`/questions/${qid}`);
  assert.equal(logs.lines().filter((l) => l.event === 'auth.required').length, before);
});

test('미로그인: 질문 작성 화면(GET /questions/new)은 여전히 401', async () => {
  const r = await new Client(app).get('/questions/new');
  assert.equal(r.status, 401);
  assert.ok(r.text.includes('로그인이 필요합니다.'));
});

test('미로그인: 질문 등록(POST /questions)은 401 이고 저장되지 않는다', async () => {
  const before = (await count());
  const r = await new Client(app).post('/questions', { program_id: 'PRGM0001', title: 't', body: 'b', form_token: 'anon-token-1' }, { csrf: false });
  assert.equal(r.status, 401);
  assert.equal((await count()), before);
});

test('미로그인: 답변 등록(POST)은 401', async () => {
  const r = await new Client(app).post(`/questions/${qid}/answers`, { body: 'x' }, { csrf: false });
  assert.equal(r.status, 401);
});

test('로그인 사용자의 읽기는 기존과 같다(내비게이션에 질문하기·로그아웃)', async () => {
  const c = new Client(app);
  await c.login('EMP7731', 'pw-1234');
  const r = await c.get('/');
  assert.equal(r.status, 200);
  assert.ok(r.text.includes('href="/questions/new"') && r.text.includes('action="/logout"'));
});
