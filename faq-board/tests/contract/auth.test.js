import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, seedUser, captureLogs, Client, loggedInClient, countRows, insertQuestion, insertAnswer } from '../helpers/server.js';

let app;
test.before(async () => {
  app = await startApp();
  await seedUser(app, 'EMP7731', '홍길동', 'pw-1234');
});
test.after(() => app.close());

test('미로그인: 질문 작성 화면은 401 + 로그인 안내, 읽기 화면(목록·상세)은 로그인 없이 열린다', async () => {
  const c = new Client(app);
  const w = await c.get('/questions/new');
  assert.equal(w.status, 401);
  assert.match(w.text, /로그인이 필요합니다\./);
  assert.match(w.text, /href="\/login"/);
  assert.equal((await c.get('/')).status, 200);
  assert.equal((await c.get('/questions/1')).status, 404); // 없는 질문: 401 이 아니라 404
});
test('미로그인 POST 는 401 이고 저장되지 않는다', async () => {
  const c = new Client(app);
  for (const p of ['/questions', '/questions/1/answers']) {
    const r = await c.request('POST', p, { title: 't', body: 'b', program_id: 'PRGM0001' });
    assert.equal(r.status, 401, p);
    assert.match(r.text, /로그인이 필요합니다\./);
  }
  assert.equal((await countRows(app, 'questions')), 0);
});
test('로그인 성공: 303 / + sid 쿠키(HttpOnly, SameSite=Lax)', async () => {
  const res = await fetch(app.url + '/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'emp_no=EMP7731&password=pw-1234',
    redirect: 'manual',
  });
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), '/');
  const sc = res.headers.getSetCookie().find((s) => s.startsWith('sid='));
  assert.ok(sc);
  assert.match(sc, /HttpOnly/i);
  assert.match(sc, /SameSite=Lax/i);
});
test('틀린 비밀번호·없는 사번은 동일한 401 문구', async () => {
  const msg = '사번 또는 비밀번호가 올바르지 않습니다.';
  const a = await new Client(app).login('EMP7731', 'wrong');
  const b = await new Client(app).login('NOBODY', 'pw-1234');
  assert.equal(a.status, 401);
  assert.equal(b.status, 401);
  assert.ok(a.text.includes(msg));
  assert.ok(b.text.includes(msg));
});
test('POST 는 csrf 가 없거나 틀리면 403', async () => {
  const c = await loggedInClient(app, 'EMP7731', 'pw-1234');
  const base = { program_id: 'PRGM0001', title: 't', body: 'b', form_token: 'tok-csrf-1' };
  assert.equal((await c.post('/questions', base, { csrf: false })).status, 403);
  assert.equal((await c.post('/questions', base, { csrf: 'wrong' })).status, 403);
  assert.equal((await countRows(app, 'questions')), 0);
});
test('로그아웃 후 세션은 무효', async () => {
  const c = await loggedInClient(app, 'EMP7731', 'pw-1234');
  assert.equal((await c.get('/')).status, 200);
  const r = await c.post('/logout');
  assert.equal(r.status, 303);
  assert.equal(r.location, '/login');
  assert.equal((await c.get('/questions/new')).status, 401);
  const list = await c.get('/');
  assert.equal(list.status, 200); // 읽기는 공개
  assert.ok(!list.text.includes('action="/logout"'), '로그아웃 후에는 로그인 사용자 화면이 아니다');
});
test('보안 헤더', async () => {
  const r = await new Client(app).get('/login');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-security-policy'), "default-src 'self'");
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
});
test('auth.required / login(denied) 로그가 남고 사번·이름은 없다', async () => {
  const cap = captureLogs();
  try {
    await new Client(app).get('/questions/new');
    await new Client(app).login('EMP7731', 'wrong');
    const lines = cap.lines();
    assert.ok(lines.some((l) => l.event === 'auth.required' && l.result === 'denied'));
    assert.ok(lines.some((l) => l.event === 'login' && l.result === 'denied'));
    const t = cap.text();
    assert.ok(!t.includes('EMP7731'));
    assert.ok(!t.includes('홍길동'));
  } finally {
    cap.restore();
  }
});
