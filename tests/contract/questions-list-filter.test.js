import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, seedUser, loggedInClient } from '../helpers/server.js';

const rows = (text) => [...text.matchAll(/<tr data-question-id="(\d+)">([\s\S]*?)<\/tr>/g)].map((m) => ({ id: Number(m[1]), html: m[2] }));
const programOf = (row) => row.html.match(/class="program-id">([^<]*)</)[1];
const NO_MATCH = '해당 프로그램 ID의 질문이 없습니다.';

function seed(app, userId, programId, n) {
  const ins = app.db.prepare('INSERT INTO questions(program_id, title, body, author_id, created_at, form_token) VALUES (?, ?, ?, ?, ?, ?)');
  const ids = [];
  for (let i = 0; i < n; i++) {
    const r = ins.run(programId, `${programId} 질문 ${i + 1}`, '내용', userId, Date.now() + ids.length, `tok-${programId}-${i}-${Math.random()}`);
    ids.push(Number(r.lastInsertRowid));
  }
  return ids;
}

async function setup(programs = ['PRGM0001', 'PRGM0002', 'PRGM0003']) {
  const app = await startApp({ programs });
  const userId = seedUser(app, 'EMP7731', '홍길동', 'pw-1234');
  const client = await loggedInClient(app, 'EMP7731', 'pw-1234');
  return { app, userId, client };
}

test('프로그램 ID 필터: 해당 ID 질문만 보이고, 해제하면 전체가 보인다', async () => {
  const { app, userId, client } = await setup();
  try {
    seed(app, userId, 'PRGM0001', 3);
    seed(app, userId, 'PRGM0002', 2);

    const f = await client.get('/?program_id=PRGM0001');
    assert.equal(f.status, 200);
    const list = rows(f.text);
    assert.equal(list.length, 3);
    assert.ok(list.every((r) => programOf(r) === 'PRGM0001'));

    assert.match(f.text, /필터 해제/);
    assert.match(f.text, /<a href="\/">[^<]*필터 해제/);

    const all = await client.get('/');
    assert.equal(rows(all.text).length, 5);
    const cleared = await client.get('/?program_id=');
    assert.equal(rows(cleared.text).length, 5);
  } finally {
    await app.close();
  }
});

test('필터 입력란: 레이블이 있고 현재 값이 유지된다', async () => {
  const { app, userId, client } = await setup();
  try {
    seed(app, userId, 'PRGM0001', 1);
    const r = await client.get('/?program_id=PRGM0001');
    assert.match(r.text, /<label for="filter-program-id"/);
    assert.match(r.text, /<input[^>]*id="filter-program-id"[^>]*name="program_id"[^>]*value="PRGM0001"|<input[^>]*name="program_id"[^>]*id="filter-program-id"[^>]*value="PRGM0001"/);
    assert.match(r.text, /<form[^>]*method="get"/i);
  } finally {
    await app.close();
  }
});

test('필터 결과도 최신 등록순이다', async () => {
  const { app, userId, client } = await setup();
  try {
    const ids = seed(app, userId, 'PRGM0001', 3);
    seed(app, userId, 'PRGM0002', 1);
    const list = rows((await client.get('/?program_id=PRGM0001')).text);
    assert.deepEqual(list.map((r) => r.id), [...ids].reverse());
  } finally {
    await app.close();
  }
});

test('질문이 없는 프로그램 ID(허용 목록에 있음)로 거르면 안내 문구가 나온다', async () => {
  const { app, userId, client } = await setup();
  try {
    seed(app, userId, 'PRGM0001', 2);
    const r = await client.get('/?program_id=PRGM0003');
    assert.equal(r.status, 200);
    assert.equal(rows(r.text).length, 0);
    assert.ok(r.text.includes(NO_MATCH));
  } finally {
    await app.close();
  }
});

test('형식 오류·미등록 값으로 거르면 오류 없이 빈 목록과 같은 안내 문구가 나온다', async () => {
  const { app, userId, client } = await setup();
  try {
    seed(app, userId, 'PRGM0001', 2);
    for (const bad of ['prg 1', 'PRGM9999', "'; DROP TABLE questions; --", '%']) {
      const r = await client.get(`/?program_id=${encodeURIComponent(bad)}`);
      assert.equal(r.status, 200, bad);
      assert.equal(rows(r.text).length, 0, bad);
      assert.ok(r.text.includes(NO_MATCH), bad);
    }
    assert.equal(app.db.prepare('SELECT COUNT(*) c FROM questions').get().c, 2);
  } finally {
    await app.close();
  }
});

test('필터 값의 앞뒤 공백은 제거하고, 부분 일치·와일드카드는 쓰지 않는다', async () => {
  const { app, userId, client } = await setup();
  try {
    seed(app, userId, 'PRGM0001', 3);
    seed(app, userId, 'PRGM0002', 1);
    assert.equal(rows((await client.get('/?program_id=%20PRGM0001%20')).text).length, 3);
    assert.equal(rows((await client.get('/?program_id=PRGM')).text).length, 0);
    assert.equal(rows((await client.get('/?program_id=PRGM000_')).text).length, 0);
    assert.equal(rows((await client.get('/?program_id=PRGM%25')).text).length, 0);
  } finally {
    await app.close();
  }
});

test('질문이 하나도 없으면 "등록된 질문이 없습니다."가 나온다', async () => {
  const { app, client } = await setup();
  try {
    const r = await client.get('/');
    assert.equal(rows(r.text).length, 0);
    assert.ok(r.text.includes('등록된 질문이 없습니다.'));
    assert.ok(!r.text.includes(NO_MATCH));
  } finally {
    await app.close();
  }
});

test('한 페이지 20건: 21건이면 2페이지에 1건, 잘못된 page 는 1페이지', async () => {
  const { app, userId, client } = await setup();
  try {
    seed(app, userId, 'PRGM0001', 21);
    assert.equal(rows((await client.get('/')).text).length, 20);
    assert.equal(rows((await client.get('/?page=2')).text).length, 1);
    for (const bad of ['0', '-3', 'abc', '']) {
      assert.equal(rows((await client.get(`/?page=${bad}`)).text).length, 20, bad);
    }
    assert.equal(rows((await client.get('/?page=3')).text).length, 0);
  } finally {
    await app.close();
  }
});

test('필터와 페이지를 함께 적용하고, 페이지 링크가 필터를 유지한다', async () => {
  const { app, userId, client } = await setup();
  try {
    seed(app, userId, 'PRGM0001', 25);
    seed(app, userId, 'PRGM0002', 3);
    const p1 = await client.get('/?program_id=PRGM0001');
    assert.equal(rows(p1.text).length, 20);
    assert.match(p1.text, /href="\/\?program_id=PRGM0001&amp;page=2"/);
    const p2 = await client.get('/?program_id=PRGM0001&page=2');
    const list = rows(p2.text);
    assert.equal(list.length, 5);
    assert.ok(list.every((r) => programOf(r) === 'PRGM0001'));
  } finally {
    await app.close();
  }
});

test('미로그인 상태의 필터 조회는 401 이고 내용이 노출되지 않는다', async () => {
  const { app, userId } = await setup();
  try {
    seed(app, userId, 'PRGM0001', 1);
    const res = await fetch(`${app.url}/?program_id=PRGM0001`);
    assert.equal(res.status, 401);
    assert.ok(!(await res.text()).includes('PRGM0001 질문'));
  } finally {
    await app.close();
  }
});
