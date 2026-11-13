import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, seedUser, loggedInClient, countRows, insertQuestion, insertAnswer } from '../helpers/server.js';

let app, client, userId;
const count = () => countRows(app, 'questions');

test.before(async () => {
  app = await startApp({ programs: ['PRGM0001', 'PRGM0002'] });
  userId = await seedUser(app, 'EMP7731', '홍길동', 'pw-1234');
  client = await loggedInClient(app, 'EMP7731', 'pw-1234');
});
test.after(() => app.close());

const valid = (over = {}) => ({ program_id: 'PRGM0001', title: '결재 화면이 열리지 않아요', body: '클릭해도 반응이 없습니다.', ...over });

test('정상 등록: 303 → 상세, 상세·목록에 프로그램 ID·제목 표시, 작성자·작성일시 저장', async () => {
  const before = (await count());
  const t0 = Date.now();
  const r = await client.ask(valid());
  assert.equal(r.status, 303);
  assert.match(r.location, /^\/questions\/\d+$/);
  assert.equal((await count()), before + 1);

  const detail = await client.get(r.location);
  assert.equal(detail.status, 200);
  assert.ok(detail.text.includes('PRGM0001'));
  assert.ok(detail.text.includes('결재 화면이 열리지 않아요'));
  assert.ok(detail.text.includes('홍길동'));
  assert.match(detail.text, /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);

  const list = await client.get('/');
  assert.equal(list.status, 200);
  assert.ok(list.text.includes('결재 화면이 열리지 않아요'));

  const row = await app.db.get('SELECT * FROM questions ORDER BY id DESC LIMIT 1');
  assert.equal(row.author_id, userId);
  assert.equal(row.program_id, 'PRGM0001');
  assert.ok(row.created_at >= t0 - 1000 && row.created_at <= Date.now() + 1000);
});

test('앞뒤 공백이 있는 프로그램 ID 는 제거 후 등록된다', async () => {
  const before = (await count());
  const r = await client.ask(valid({ program_id: ' PRGM0002 ' }));
  assert.equal(r.status, 303);
  assert.equal((await count()), before + 1);
  assert.equal((await app.db.get('SELECT program_id FROM questions ORDER BY id DESC LIMIT 1')).program_id, 'PRGM0002');
});

const rejects = [
  ['프로그램 ID 누락', { program_id: '' }, '프로그램 ID를 입력해 주세요.', 'program_id'],
  ['프로그램 ID 공백만', { program_id: '   ' }, '프로그램 ID를 입력해 주세요.', 'program_id'],
  ['프로그램 ID 형식 오류(prg 1)', { program_id: 'prg 1' }, '프로그램 ID 형식이 올바르지 않습니다.', 'program_id'],
  ['프로그램 ID 소문자', { program_id: 'prgm0001' }, '프로그램 ID 형식이 올바르지 않습니다.', 'program_id'],
  ['프로그램 ID 중복 필드', { program_id: ['PRGM0001', 'PRGM0002'] }, '프로그램 ID 형식이 올바르지 않습니다.', 'program_id'],
  ['목록에 없는 프로그램 ID', { program_id: 'PRGM9999' }, '등록되지 않은 프로그램 ID입니다.', 'program_id'],
  ['제목 공백', { title: '   ' }, '제목을 입력해 주세요.', 'title'],
  ['제목 101자', { title: '가'.repeat(101) }, '제목은 100자 이내로 입력해 주세요.', 'title'],
  ['내용 공백', { body: '  ' }, '내용을 입력해 주세요.', 'body'],
  ['내용 4001자', { body: 'a'.repeat(4001) }, '내용은 4,000자 이내로 입력해 주세요.', 'body'],
];
for (const [name, over, message, field] of rejects) {
  test(`400: ${name}`, async () => {
    const before = (await count());
    const input = valid({ title: '유지될 제목', body: '유지될 내용', ...over });
    const r = await client.ask(input);
    assert.equal(r.status, 400);
    assert.equal((await count()), before, '질문이 저장되면 안 된다');
    assert.ok(r.text.includes(message), `문구 없음: ${message}`);
    assert.match(r.text, /오류:/);
    assert.match(r.text, /role="alert"/);
    assert.match(r.text, new RegExp(`aria-describedby="[^"]*err-${field}`));
    if (!over.title) assert.ok(r.text.includes('유지될 제목'), '제목 입력 유지');
    if (!over.body) assert.ok(r.text.includes('유지될 내용'), '내용 입력 유지');
  });
}

test('화면을 거치지 않은 직접 POST 도 서버가 허용 목록으로 검증한다', async () => {
  const before = (await count());
  const r = await client.post('/questions', { program_id: 'PRGM9999', title: 't', body: 'b', form_token: 'direct-post-1' });
  assert.equal(r.status, 400);
  assert.ok(r.text.includes('등록되지 않은 프로그램 ID입니다.'));
  assert.equal((await count()), before);
});

test('태그 필드를 보내도 무시되고 스키마에 태그 열이 없다', async () => {
  const r = await client.ask(valid({ tag: '긴급' }));
  assert.equal(r.status, 303);
  const cols = (await app.db.all("SELECT column_name FROM information_schema.columns WHERE table_name = 'questions'")).map((c) => c.column_name);
  assert.ok(!cols.includes('tag') && !cols.includes('tags'));
});

test('제목의 마크업은 이스케이프되어 글자 그대로 표시된다', async () => {
  const r = await client.ask(valid({ title: '<script>alert(1)</script>' }));
  assert.equal(r.status, 303);
  const detail = await client.get(r.location);
  assert.ok(detail.text.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!detail.text.includes('<script>alert(1)</script>'));
});

test('GET /questions/new 는 폼과 프로그램 ID 제안 목록을 보여 준다', async () => {
  const r = await client.get('/questions/new');
  assert.equal(r.status, 200);
  assert.match(r.text, /<label for="program_id"/);
  assert.match(r.text, /<label for="title"/);
  assert.match(r.text, /<label for="body"/);
  assert.ok(r.text.includes('PRGM0001'));
});
