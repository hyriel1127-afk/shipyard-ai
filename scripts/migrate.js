import fs from 'node:fs';
import { loadConfig } from '../src/config.js';
import { openDb, migrate } from '../src/db.js';

const direction = process.argv[2];
if (direction !== 'up' && direction !== 'down') {
  console.error('사용법: node scripts/migrate.js up|down');
  process.exit(1);
}
const { dbPath } = loadConfig();
if (direction === 'down' && fs.existsSync(dbPath)) {
  const backup = `${dbPath}.${Date.now()}.bak`;
  fs.copyFileSync(dbPath, backup);
  console.log(`백업을 만들었습니다: ${backup}`);
}
const db = openDb(dbPath);
migrate(db, direction);
db.close();
console.log(`마이그레이션 ${direction} 완료`);
