import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, seedUser, loggedInClient, countRows, insertQuestion, insertAnswer } from '../helpers/server.js';

// 화면(GET /questions/new)을 전혀 거치지 않고, 로그인 세션 + CSRF 만으로 POST /questions 를 직접 보낸다.
// 서버가 화면의 선택 목록과 무관하게 프로그램 ID 를 검증하는지 확인한다.
let app, client;
const count = () => countRows(app, 'questions');

test.before(async () => {
  app = await startApp({ programs: ['PRGM0001', 'PRGM0002'] });
  await seedUser(app, 'EMP7731', '홍길동', 'pw-1234');
  client = await loggedInClient(app, 'EMP7731', 'pw-1234');
});
test.after(() => app.close());

const base = { title: '직접 보낸 질문', body: '내용' };
let n = 0;
const post = (fields) => client.post('/questions', { ...base, form_token: `direct-token-${++n}`, ...fields });

const cases = [
  ['누락: program_id 필드 자체가 없음', {}, '프로그램 ID를 입력해 주세요.'],
  ['누락: 빈 문자열', { program_id: '' }, '프로그램 ID를 입력해 주세요.'],
  ['누락: 공백만', { program_id: '   ' }, '프로그램 ID를 입력해 주세요.'],
  ['형식 오류: 공백이 섞임(prg 1)', { program_id: 'prg 1' }, '프로그램 ID 형식이 올바르지 않습니다.'],
  ['형식 오류: 소문자', { program_id: 'prgm0001' }, '프로그램 ID 형식이 올바르지 않습니다.'],
  ['형식 오류: 숫자 3자리', { program_id: 'PRGM001' }, '프로그램 ID 형식이 올바르지 않습니다.'],
  ['형식 오류: 끝 글자 2자', { program_id: 'PRGM0001AB' }, '프로그램 ID 형식이 올바르지 않습니다.'],
  ['형식 오류: 필드가 둘 이상', { program_id: ['PRGM0001', 'PRGM0002'] }, '프로그램 ID 형식이 올바르지 않습니다.'],
  ['형식 오류: SQL 문자열', { program_id: "PRGM0001'; DROP TABLE questions;--" }, '프로그램 ID 형식이 올바르지 않습니다.'],
  ['허용 목록에 없음', { program_id: 'PRGM9999' }, '등록되지 않은 프로그램 ID입니다.'],
  ['허용 목록에 없음: 9자 형식', { program_id: 'PRGM0001Z' }, '등록되지 않은 프로그램 ID입니다.'],
];

for (const [name, fields, message] of cases) {
  test(`직접 POST → 400: ${name}`, async () => {
    const before = (await count());
    const r = await post(fields);
    assert.equal(r.status, 400);
    assert.ok(r.text.includes(message), `문구 없음: ${message}`);
    assert.equal((await count()), before, '질문이 저장되면 안 된다');
  });
}

test('직접 POST: 허용 목록에 있는 올바른 ID 는 같은 경로로 등록된다(대조군)', async () => {
  const before = (await count());
  const r = await post({ program_id: 'PRGM0002' });
  assert.equal(r.status, 303);
  assert.equal((await count()), before + 1);
});

test('직접 POST: 서버가 발급하지 않은 form_token 이어도 프로그램 ID 검증은 그대로 적용된다', async () => {
  const before = (await count());
  const r = await client.post('/questions', { ...base, program_id: 'PRGM9999', form_token: 'never-issued-by-server' });
  assert.equal(r.status, 400);
  assert.equal((await count()), before);
});

test('직접 POST: 허용 목록 파일이 바뀌면 재시작 없이 검증에 반영된다', async () => {
  const fs = await import('node:fs');
  const before = (await count());
  assert.equal((await post({ program_id: 'PRGM0003' })).status, 400);
  fs.writeFileSync(app.programsPath, JSON.stringify(['PRGM0001', 'PRGM0002', 'PRGM0003']));
  const t = new Date(Date.now() + 5000);
  fs.utimesSync(app.programsPath, t, t);
  assert.equal((await post({ program_id: 'PRGM0003' })).status, 303);
  assert.equal((await count()), before + 1);
});
