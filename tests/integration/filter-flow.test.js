import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startApp, seedUser, loggedInClient } from '../helpers/server.js';

const IDS = ['PRGM0001', 'PRGM0002', 'PRGM0003', 'PRGM0004', 'PRGM0005A'];

test('질문 50건을 시드해 모든 필터 결과가 선택한 프로그램 ID 와 100% 일치한다', async () => {
  const app = await startApp({ programs: IDS });
  try {
    const userId = seedUser(app, 'EMP7731', '홍길동', 'pw-1234');
    const ins = app.db.prepare('INSERT INTO questions(program_id, title, body, author_id, created_at, form_token) VALUES (?, ?, ?, ?, ?, ?)');
    const expected = Object.fromEntries(IDS.map((id) => [id, 0]));
    for (let i = 0; i < 50; i++) {
      const id = IDS[i % IDS.length];
      ins.run(id, `질문 ${i}`, '내용', userId, 1000 + i, `flow-${i}`);
      expected[id]++;
    }
    const client = await loggedInClient(app, 'EMP7731', 'pw-1234');
    for (const id of IDS) {
      const r = await client.get(`/?program_id=${id}`);
      const found = [...r.text.matchAll(/class="program-id">([^<]*)</g)].map((m) => m[1]);
      assert.equal(found.length, expected[id], id);
      assert.ok(found.every((f) => f === id), `${id} 필터에 다른 ID 가 섞임`);
    }
  } finally {
    await app.close();
  }
});

test('필터는 (program_id, id DESC) 인덱스를 쓰는 열 조건이다', async () => {
  const app = await startApp();
  try {
    const plan = app.db
      .prepare('EXPLAIN QUERY PLAN SELECT id FROM questions WHERE program_id = ? ORDER BY id DESC LIMIT 20')
      .all('PRGM0001')
      .map((r) => r.detail)
      .join(' | ');
    assert.match(plan, /idx_questions_program/);
    assert.doesNotMatch(plan, /SCAN questions(?! USING)/);
  } finally {
    await app.close();
  }
});

test('필터 구현은 LIKE·FTS 같은 검색 색인을 쓰지 않는다', () => {
  const src = fs.readFileSync(new URL('../../src/handlers/questions.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\bLIKE\b/i);
  assert.doesNotMatch(src, /\bfts\d?\b|\bMATCH\b/i);
  assert.match(src, /WHERE[^`'"]*program_id\s*=\s*\?/i);
});
