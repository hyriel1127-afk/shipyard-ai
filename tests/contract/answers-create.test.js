import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, seedUser, loggedInClient, captureLogs, Client, countRows, insertQuestion, insertAnswer } from '../helpers/server.js';

let app, asker, answerer, plain, plain2, qid;
const count = () => countRows(app, 'answers');

async function formToken(client, id) {
  const r = await client.get(`/questions/${id}`);
  const m = r.text.match(/name="form_token" value="([^"]+)"/);
  if (!m) throw new Error('answer form_token not found, status=' + r.status);
  return m[1];
}
async function answer(client, id, body, extra = {}) {
  const form_token = extra.form_token ?? (await formToken(answerer, id));
  return client.post(`/questions/${id}/answers`, { body, form_token, ...extra });
}

test.before(async () => {
  app = await startApp();
  await seedUser(app, 'EMP0001', '질문자', 'pw-1111');
  await seedUser(app, 'EMP0002', '담당자', 'pw-2222', { answerer: true });
  await seedUser(app, 'EMP0003', '일반1', 'pw-3333');
  await seedUser(app, 'EMP0004', '일반2', 'pw-4444');
  asker = await loggedInClient(app, 'EMP0001', 'pw-1111');
  answerer = await loggedInClient(app, 'EMP0002', 'pw-2222');
  plain = await loggedInClient(app, 'EMP0003', 'pw-3333');
  plain2 = await loggedInClient(app, 'EMP0004', 'pw-4444');
  const r = await asker.ask({ program_id: 'PRGM0001', title: '질문입니다', body: '내용입니다' });
  qid = Number(r.location.split('/').pop());
});
test.after(() => app.close());

test('담당자: 303 → 상세, 답변 수 +1, 작성일시(KST) 표시, 등록 순서대로 표시', async () => {
  const before = (await count());
  const r1 = await answer(answerer, qid, '첫 번째 답변');
  assert.equal(r1.status, 303);
  assert.equal(r1.location, `/questions/${qid}`);
  const r2 = await answer(answerer, qid, '두 번째 답변');
  assert.equal(r2.status, 303);
  assert.equal((await count()), before + 2);

  const d = await asker.get(`/questions/${qid}`);
  assert.ok(d.text.indexOf('첫 번째 답변') > -1 && d.text.indexOf('첫 번째 답변') < d.text.indexOf('두 번째 답변'));
  assert.match(d.text, /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
  const row = await app.db.get('SELECT * FROM answers ORDER BY id DESC LIMIT 1');
  assert.ok(row.author_id > 0 && row.created_at > 0);
  const list = await asker.get('/');
  assert.match(list.text, /2/);
});

test('비담당자 직접 POST → 403, 저장 0건 (여러 계정)', async () => {
  const token = await formToken(answerer, qid);
  const before = (await count());
  for (const [i, c] of [plain, plain2, asker].entries()) {
    const r = await c.post(`/questions/${qid}/answers`, { body: '몰래 답변', form_token: `${token}-x${i}` });
    assert.equal(r.status, 403);
    assert.ok(r.text.includes('답변 권한이 없습니다.'));
  }
  assert.equal((await count()), before);
});

test('비담당자에게는 답변 입력란이 없고 담당자에게는 있다', async () => {
  assert.ok(!(await plain.get(`/questions/${qid}`)).text.includes('name="form_token"'));
  assert.ok((await answerer.get(`/questions/${qid}`)).text.includes('name="form_token"'));
});

test('미로그인 POST → 401, 저장 없음', async () => {
  const before = (await count());
  const r = await new Client(app).request('POST', `/questions/${qid}/answers`, { body: 'x', form_token: 'tok-anon-1' });
  assert.equal(r.status, 401);
  assert.ok(r.text.includes('로그인이 필요합니다.'));
  assert.equal((await count()), before);
});

test('없는 질문 → 404, 저장 없음', async () => {
  const before = (await count());
  const r = await answerer.post('/questions/99999/answers', { body: '답변', form_token: 'tok-nf-0001' });
  assert.equal(r.status, 404);
  assert.ok(r.text.includes('존재하지 않는 질문입니다.'));
  assert.equal((await count()), before);
});

test('내용 검증: 공백 400, 4,000자 통과, 4,001자 400, 입력 유지', async () => {
  const before = (await count());
  const empty = await answer(answerer, qid, '   ');
  assert.equal(empty.status, 400);
  assert.ok(empty.text.includes('답변 내용을 입력해 주세요.'));
  assert.ok(empty.text.includes('질문입니다'));
  assert.ok(empty.text.includes('aria-describedby'));

  const long = await answer(answerer, qid, '가'.repeat(4001));
  assert.equal(long.status, 400);
  assert.ok(long.text.includes('답변은 4,000자 이내로 입력해 주세요.'));
  assert.equal((await count()), before);

  const keep = await answer(answerer, qid, '유지될 <b>내용</b>'.repeat(1) + ' ' + '가'.repeat(4000));
  assert.equal(keep.status, 400);
  assert.ok(keep.text.includes('유지될 &lt;b&gt;내용&lt;/b&gt;'));

  const ok = await answer(answerer, qid, '가'.repeat(4000));
  assert.equal(ok.status, 303);
  assert.equal((await count()), before + 1);
});

test('같은 form_token 재전송 → 1건만, 같은 상세로 303', async () => {
  const token = await formToken(answerer, qid);
  const before = (await count());
  const a = await answer(answerer, qid, '중복 방지', { form_token: token });
  const b = await answer(answerer, qid, '중복 방지', { form_token: token });
  assert.equal(a.status, 303);
  assert.equal(b.status, 303);
  assert.equal(a.location, b.location);
  assert.equal((await count()), before + 1);
});

test('검사 순서: 비담당자+없는 질문+빈 내용 → 403', async () => {
  const r = await plain.post('/questions/99999/answers', { body: '', form_token: 'tok-order-1' });
  assert.equal(r.status, 403);
  const r2 = await answerer.post('/questions/99999/answers', { body: '', form_token: 'tok-order-2' });
  assert.equal(r2.status, 404);
});

test('담당자에서 제거되면 새 답변은 거부되고 이전 답변은 유지', async () => {
  const c = await loggedInClient(app, 'EMP0002', 'pw-2222');
  const before = (await count());
  await app.db.run('DELETE FROM answerers WHERE emp_no = $1', ['EMP0002']);
  const r = await c.post(`/questions/${qid}/answers`, { body: '제거 후', form_token: 'tok-removed-1' });
  assert.equal(r.status, 403);
  assert.equal((await count()), before);
  assert.ok((await asker.get(`/questions/${qid}`)).text.includes('첫 번째 답변'));
  await app.db.run('INSERT INTO answerers(emp_no) VALUES ($1)', ['EMP0002']);
});

test('로그: answer.create / auth.denied 가 ref_id·user_id 만으로 기록, 사번·이름·본문 없음', async () => {
  const logs = captureLogs();
  try {
    await answer(answerer, qid, '로그검증본문XYZ');
    await plain.post(`/questions/${qid}/answers`, { body: '거부본문XYZ', form_token: 'tok-log-0001' });
    const events = logs.lines();
    const ok = events.find((e) => e.event === 'answer.create');
    const denied = events.find((e) => e.event === 'auth.denied');
    assert.ok(ok && ok.result === 'ok' && Number.isInteger(ok.ref_id) && Number.isInteger(ok.user_id));
    assert.ok(denied && denied.result === 'denied' && Number.isInteger(denied.user_id));
    const text = logs.text();
    for (const s of ['EMP0002', 'EMP0003', '담당자', '일반1', 'XYZ']) assert.ok(!text.includes(s), s);
  } finally {
    logs.restore();
  }
});
