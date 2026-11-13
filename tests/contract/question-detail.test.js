import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, seedUser, loggedInClient, Client, countRows, insertQuestion, insertAnswer } from '../helpers/server.js';

// 계약 #7: GET /questions/:id
let app, asker, reader, qid, emptyQid;

test.before(async () => {
  app = await startApp({ programs: ['PRGM0001', 'PRGM0002'] });
  const askerId = await seedUser(app, 'EMP7731', '홍길동', 'pw-1234');
  await seedUser(app, 'EMP1000', '일반사용자', 'pw-1234');
  const answererId = await seedUser(app, 'EMP9001', '담당자김', 'pw-1234', { answerer: true });
  await seedUser(app, 'EMP9002', '담당자이', 'pw-1234', { answerer: true });

  // 2025-01-01T00:30:00Z = 2025-01-01 09:30 KST
  qid = await insertQuestion(app, 'PRGM0002', '<b>로그인 오류</b>', '첫 줄\n<script>alert(1)</script>', askerId, Date.UTC(2025, 0, 1, 0, 30), 'tok-detail-1');
  emptyQid = await insertQuestion(app, 'PRGM0001', '답변 없는 질문', '내용', askerId, Date.UTC(2025, 0, 2), 'tok-detail-2');

  await insertAnswer(app, qid, '첫 번째 답변', answererId, Date.UTC(2025, 0, 1, 1), 'atok-1');
  await insertAnswer(app, qid, '두 번째 답변', answererId, Date.UTC(2025, 0, 1, 2), 'atok-2');
  await insertAnswer(app, qid, '세 번째 답변', answererId, Date.UTC(2025, 0, 1, 3), 'atok-3');

  reader = await loggedInClient(app, 'EMP1000', 'pw-1234');
  asker = await loggedInClient(app, 'EMP7731', 'pw-1234');
});
test.after(() => app.close());

test('상세: 프로그램 ID·제목·내용·작성일시(KST)·작성자가 표시된다', async () => {
  const r = await reader.get(`/questions/${qid}`);
  assert.equal(r.status, 200);
  assert.ok(r.text.includes('PRGM0002'));
  assert.ok(r.text.includes('2025-01-01 09:30'), '작성일시는 KST 로 표시');
  assert.ok(r.text.includes('홍길동'));
});

test('상세: 제목과 내용은 이스케이프되어 스크립트가 실행되지 않는다', async () => {
  const r = await reader.get(`/questions/${qid}`);
  assert.ok(r.text.includes('&lt;b&gt;로그인 오류&lt;/b&gt;'));
  assert.ok(r.text.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!r.text.includes('<script>alert(1)'));
});

test('상세: 답변이 등록 순서대로 전부 표시된다', async () => {
  const r = await reader.get(`/questions/${qid}`);
  const i1 = r.text.indexOf('첫 번째 답변');
  const i2 = r.text.indexOf('두 번째 답변');
  const i3 = r.text.indexOf('세 번째 답변');
  assert.ok(i1 > 0 && i2 > i1 && i3 > i2, '등록 순서');
});

test('상세: 답변이 0건이면 "아직 답변이 없습니다."', async () => {
  const r = await reader.get(`/questions/${emptyQid}`);
  assert.equal(r.status, 200);
  assert.ok(r.text.includes('아직 답변이 없습니다.'));
});

for (const id of ['99999', '0', '-1', 'abc', '1.5', '1e3']) {
  test(`상세: 잘못된/없는 id "${id}" → 404 + 목록 링크`, async () => {
    const r = await reader.get(`/questions/${encodeURIComponent(id)}`);
    assert.equal(r.status, 404);
    assert.ok(r.text.includes('존재하지 않는 질문입니다.'));
    assert.ok(r.text.includes('href="/"'), '목록으로 돌아가는 링크');
  });
}

test('상세: 일반 사용자에게는 답변 입력란이 없다', async () => {
  const r = await reader.get(`/questions/${qid}`);
  assert.ok(!r.text.includes('name="body"'));
  assert.ok(!r.text.includes(`/questions/${qid}/answers`));
});

test('상세: 질문 작성자라도 담당자가 아니면 답변 입력란이 없다', async () => {
  const r = await asker.get(`/questions/${qid}`);
  assert.ok(!r.text.includes('name="body"'));
});

test('상세: 응답 어디에도 답변 담당자 사번 목록이 없다', async () => {
  for (const c of [reader, asker]) {
    const r = await c.get(`/questions/${qid}`);
    assert.ok(!r.text.includes('EMP9001'));
    assert.ok(!r.text.includes('EMP9002'));
  }
  const r = await reader.get(`/questions/${emptyQid}`);
  assert.ok(!r.text.includes('EMP9001') && !r.text.includes('EMP9002'));
});

test('상세: 로그인하지 않아도 읽을 수 있다(읽기 공개)', async () => {
  const r = await new Client(app).get(`/questions/${qid}`);
  assert.equal(r.status, 200);
  assert.ok(r.text.includes('첫 번째 답변'));
});
