import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startApp, seedUser, loggedInClient, countRows, insertQuestion, insertAnswer } from '../helpers/server.js';

const IDS = ['PRGM0001', 'PRGM0002', 'PRGM0003', 'PRGM0004', 'PRGM0005A'];

test('질문 50건을 시드해 모든 필터 결과가 선택한 프로그램 ID 와 100% 일치한다', async () => {
  const app = await startApp({ programs: IDS });
  try {
    const userId = await seedUser(app, 'EMP7731', '홍길동', 'pw-1234');
    const expected = Object.fromEntries(IDS.map((id) => [id, 0]));
    for (let i = 0; i < 50; i++) {
      const id = IDS[i % IDS.length];
      await insertQuestion(app, id, `질문 ${i}`, '내용', userId, 1000 + i, `flow-${i}`);
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

test('필터용 (program_id, id DESC) 인덱스가 있다', async () => {
  const app = await startApp();
  try {
    const idx = await app.db.all("SELECT indexname FROM pg_indexes WHERE tablename = 'questions'");
    assert.ok(idx.some((r) => r.indexname === 'idx_questions_program'));
    // 인덱스 사용 여부는 데이터 양과 통계에 좌우되므로 실행 계획 대신 존재만 확인한다.
  } finally {
    await app.close();
  }
});

test('필터 구현은 LIKE·FTS 같은 검색 색인을 쓰지 않는다', () => {
  const src = fs.readFileSync(new URL('../../src/handlers/questions.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\bLIKE\b/i);
  assert.doesNotMatch(src, /\bfts\d?\b|\bMATCH\b/i);
  assert.match(src, /WHERE[^`'"]*program_id\s*=\s*\$1/i);
});
