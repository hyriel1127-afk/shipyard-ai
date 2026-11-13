import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTestDb } from './pglite.js';

// 스냅샷·보고서 테스트용 메모리 Postgres(PGlite) 픽스처. 출력 폴더(<dir>/snapshot)는 일부러 만들지 않는다.
export async function makeSnapshotFixture({ migrated = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qna-snap-'));
  const outPath = path.join(dir, 'snapshot', 'qna.md');
  const db = await createTestDb({ migrated });
  let seq = 0;
  const next = () => String(++seq).padStart(6, '0');

  const fx = {
    dir,
    outPath,
    db,
    async addUser(empNo, name) {
      return (await db.get('INSERT INTO users(emp_no, name, password_hash) VALUES ($1, $2, $3) RETURNING id', [empNo, name, 'x'])).id;
    },
    async addQuestion({ programId = 'PRGM0001', title = '제목', body = '본문', createdAt = Date.UTC(2026, 10, 12, 1, 0), authorId } = {}) {
      const author = authorId ?? (await fx.defaultUser());
      return (
        await db.get(
          'INSERT INTO questions(program_id, title, body, author_id, created_at, form_token) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
          [programId, title, body, author, createdAt, 'q-' + next()],
        )
      ).id;
    },
    async addAnswer({ questionId, body = '답변', createdAt = Date.UTC(2026, 10, 12, 2, 0), authorId }) {
      const author = authorId ?? (await fx.defaultUser());
      return (
        await db.get(
          'INSERT INTO answers(question_id, body, author_id, created_at, form_token) VALUES ($1, $2, $3, $4, $5) RETURNING id',
          [questionId, body, author, createdAt, 'a-' + next()],
        )
      ).id;
    },
    async defaultUser() {
      if (!fx._user) fx._user = await fx.addUser('EMP0000', '기본작성자');
      return fx._user;
    },
    async cleanup() {
      try { await db.close(); } catch {}
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
  return fx;
}
