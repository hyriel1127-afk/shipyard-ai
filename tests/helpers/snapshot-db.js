import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb, migrate } from '../../src/db.js';

// 스냅샷 테스트용 임시 파일 DB. 읽기 전용 연결은 :memory:로 검증할 수 없어 파일을 쓴다.
// outPath의 폴더(<dir>/snapshot)는 일부러 만들지 않는다.
export function makeSnapshotFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qna-snap-'));
  const dbPath = path.join(dir, 'board.sqlite');
  const outPath = path.join(dir, 'snapshot', 'qna.md');
  const db = openDb(dbPath);
  migrate(db, 'up');
  let seq = 0;
  const next = () => String(++seq).padStart(6, '0');

  const fx = {
    dir,
    dbPath,
    outPath,
    db,
    addUser(empNo, name) {
      const r = db
        .prepare('INSERT INTO users(emp_no, name, password_hash) VALUES (?, ?, ?)')
        .run(empNo, name, 'x');
      return Number(r.lastInsertRowid);
    },
    addQuestion({ programId = 'PRGM0001', title = '제목', body = '본문', createdAt = Date.UTC(2026, 10, 12, 1, 0), authorId }) {
      const author = authorId ?? fx.defaultUser();
      const r = db
        .prepare('INSERT INTO questions(program_id, title, body, author_id, created_at, form_token) VALUES (?, ?, ?, ?, ?, ?)')
        .run(programId, title, body, author, createdAt, 'q-' + next());
      return Number(r.lastInsertRowid);
    },
    addAnswer({ questionId, body = '답변', createdAt = Date.UTC(2026, 10, 12, 2, 0), authorId }) {
      const author = authorId ?? fx.defaultUser();
      const r = db
        .prepare('INSERT INTO answers(question_id, body, author_id, created_at, form_token) VALUES (?, ?, ?, ?, ?)')
        .run(questionId, body, author, createdAt, 'a-' + next());
      return Number(r.lastInsertRowid);
    },
    defaultUser() {
      if (!fx._user) fx._user = fx.addUser('EMP0000', '기본작성자');
      return fx._user;
    },
    // 내보내기 직전에 호출: 쓰기 연결을 닫아 WAL을 정리한다(다른 연결 시나리오는 db를 직접 사용).
    closeWriter() {
      db.close();
      fx.db = null;
    },
    cleanup() {
      try { fx.db?.close(); } catch {}
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
  return fx;
}
