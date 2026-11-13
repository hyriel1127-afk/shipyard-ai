// DB 마이그레이션. 사용: node scripts/migrate.js up|down  (대상: DATABASE_URL, Neon)
// down 은 질문·답변 테이블을 삭제한다. 운영 데이터가 있으면 Neon 브랜치/백업을 먼저 만든 뒤에만 실행한다.
import '../src/env.js';
import { loadConfig } from '../src/config.js';
import { connectNeon, migrate } from '../src/db.js';

const direction = process.argv[2];
if (direction !== 'up' && direction !== 'down') {
  console.error('사용법: node scripts/migrate.js up|down');
  process.exit(1);
}
let db;
try {
  db = connectNeon(loadConfig().databaseUrl);
  await migrate(db, direction);
  console.log(`마이그레이션 ${direction} 완료`);
} catch {
  console.error('마이그레이션을 실행하지 못했습니다. DATABASE_URL과 DB 상태를 확인하세요.');
  process.exitCode = 1;
} finally {
  try { await db?.close(); } catch {}
}
