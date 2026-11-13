import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, seedUser, loggedInClient, Client } from '../helpers/server.js';

let app, c, qid;
test.before(async () => {
  app = await startApp();
  seedUser(app, 'EMP0001', '홍길동', 'pw-1234', { answerer: true });
  c = await loggedInClient(app, 'EMP0001', 'pw-1234');
  const r = await c.ask({ program_id: 'PRGM0001', title: '제목', body: '내용' });
  qid = Number(r.location.split('/').pop());
});
test.after(() => app.close());

function checkLabels(html, where) {
  for (const m of html.matchAll(/<(input|textarea)\b([^>]*)>/g)) {
    const attrs = m[2];
    if (/type="hidden"/.test(attrs) || /type="submit"/.test(attrs)) continue;
    const id = attrs.match(/\bid="([^"]+)"/)?.[1];
    assert.ok(id, `${where}: id 없는 입력란 ${m[0]}`);
    assert.ok(new RegExp(`<label for="${id}"`).test(html), `${where}: label for="${id}" 없음`);
  }
}

test('모든 화면: <html lang="ko">, 입력란마다 <label for>', async () => {
  const pages = ['/', '/?program_id=PRGM0001', '/login', '/questions/new', `/questions/${qid}`, '/questions/9999'];
  for (const p of pages) {
    const r = await c.get(p);
    assert.match(r.text, /<html lang="ko">/, p);
    checkLabels(r.text, p);
  }
  const anon = await new Client(app).get('/login');
  assert.match(anon.text, /<html lang="ko">/);
  checkLabels(anon.text, '/login(anon)');
});

test('오류 문구는 "오류:" 접두 + aria-describedby 로 입력란과 연결 (질문·답변·로그인)', async () => {
  const q = await c.ask({ program_id: '', title: '', body: '' });
  assert.equal(q.status, 400);
  for (const id of ['program_id', 'title', 'body']) {
    assert.match(q.text, new RegExp(`aria-describedby="err-${id}"`));
    assert.match(q.text, new RegExp(`id="err-${id}"[^>]*>오류:`));
  }
  assert.match(q.text, /role="alert"/);

  const tok = (await c.get(`/questions/${qid}`)).text.match(/name="form_token" value="([^"]+)"/)[1];
  const a = await c.post(`/questions/${qid}/answers`, { body: '  ', form_token: tok });
  assert.equal(a.status, 400);
  assert.match(a.text, /aria-describedby="err-answer-body"/);
  assert.match(a.text, /id="err-answer-body"[^>]*>오류:/);

  const l = await new Client(app).request('POST', '/login', { emp_no: 'EMP0001', password: 'wrong' });
  assert.equal(l.status, 401);
  assert.match(l.text, /오류:/);
  assert.match(l.text, /role="alert"/);
});
