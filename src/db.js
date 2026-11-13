// Neon(Postgres) 접속과 마이그레이션. 모든 DB 접근은 이 파일의 Db 인터페이스(async)를 거친다.
//   all(sql, params)  → 행 배열
//   get(sql, params)  → 첫 행 또는 null
//   run(sql, params)  → { rowCount, rows }
//   exec(sql)         → 여러 문장 실행(마이그레이션용, 매개변수 없음)
//   tx(fn)            → 트랜잭션: fn(txDb) 성공 시 COMMIT, 예외 시 ROLLBACK
//   close()           → 연결 종료
// 자리표시자는 Postgres 방식($1, $2 ...)이다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool, types } from '@neondatabase/serverless';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
const VERSION = '001_init';

// query: (text, params) → { rows, rowCount }. 드라이버별 차이는 여기서 흡수한다.
export function makeDb({ query, exec, tx, close }) {
  return {
    all: async (sql, params = []) => (await query(sql, params)).rows,
    get: async (sql, params = []) => (await query(sql, params)).rows[0] ?? null,
    run: async (sql, params = []) => {
      const r = await query(sql, params);
      return { rowCount: r.rowCount ?? 0, rows: r.rows };
    },
    exec,
    tx,
    close,
  };
}

// Neon 에 연결한다. 서버리스에서는 연결 수를 작게 유지한다(max 1). 풀러 연결 문자열(-pooler)을 쓰는 것을 권장한다.
export function connectNeon(connectionString) {
  if (!connectionString) throw new Error('DATABASE_URL이 설정되지 않았습니다.');
  types.setTypeParser(20, (v) => Number(v)); // BIGINT(epoch ms)를 문자열이 아닌 숫자로 받는다.
  const pool = new Pool({ connectionString, max: 1 });
  pool.on('error', () => {}); // 유휴 연결 오류로 프로세스가 죽지 않게 한다. 내용은 기록하지 않는다.
  const wrapClient = (client) => ({
    query: (t, p) => client.query(t, p),
    exec: (sql) => client.query(sql),
  });
  const db = makeDb({
    query: (t, p) => pool.query(t, p),
    exec: (sql) => pool.query(sql),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const c = wrapClient(client);
        const inner = makeDb({
          query: c.query,
          exec: c.exec,
          tx: () => {
            throw new Error('중첩 트랜잭션은 지원하지 않습니다.');
          },
          close: () => {},
        });
        const out = await fn(inner);
        await client.query('COMMIT');
        return out;
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch {}
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  });
  return db;
}

async function isApplied(db) {
  await db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at BIGINT NOT NULL)');
  return !!(await db.get('SELECT 1 AS x FROM schema_migrations WHERE version = $1', [VERSION]));
}

export async function migrate(db, direction) {
  if (direction !== 'up' && direction !== 'down') throw new Error('direction must be up or down');
  const applied = await isApplied(db);
  if (direction === 'up' ? applied : !applied) return;
  const sql = fs.readFileSync(path.join(dir, `${VERSION}.${direction}.sql`), 'utf8');
  await db.tx(async (t) => {
    await t.exec(sql);
    if (direction === 'up') await t.run('INSERT INTO schema_migrations(version, applied_at) VALUES ($1, $2)', [VERSION, Date.now()]);
    else await t.run('DELETE FROM schema_migrations WHERE version = $1', [VERSION]);
  });
}
