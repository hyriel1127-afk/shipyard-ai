import { PGlite, types } from '@electric-sql/pglite';
import { makeDb, migrate } from '../../src/db.js';

// 테스트용 메모리 Postgres(PGlite)를 src/db.js 의 Db 인터페이스로 감싼다. 운영(Neon)과 같은 SQL·마이그레이션을 쓴다.
// 한 연결만 쓰므로 트랜잭션 안에서 다른 쿼리를 끼워 넣는 동시성 시험은 할 수 없다.
function wrap(pg, { inTx = false } = {}) {
  const query = async (text, params) => {
    const r = await pg.query(text, params);
    return { rows: r.rows, rowCount: r.affectedRows };
  };
  return makeDb({
    query,
    exec: async (sql) => {
      await pg.exec(sql);
    },
    tx: inTx
      ? () => {
          throw new Error('중첩 트랜잭션은 지원하지 않습니다.');
        }
      : (fn) => pg.transaction((t) => fn(wrap(t, { inTx: true }))),
    close: () => (inTx ? undefined : pg.close()),
  });
}

export async function createTestDb({ migrated = true } = {}) {
  const pg = new PGlite({ parsers: { [types.INT8]: (v) => Number(v) } });
  await pg.waitReady;
  const db = wrap(pg);
  if (migrated) await migrate(db, 'up');
  return db;
}

// 모든 조회가 실패하는 Db. "DB를 읽을 수 없는" 경우를 시험할 때 쓴다.
export function createBrokenDb() {
  const boom = async () => {
    throw new Error('connection refused');
  };
  return makeDb({ query: boom, exec: boom, tx: boom, close: async () => {} });
}
