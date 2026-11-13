import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
const VERSION = '001_init';

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  return db;
}

function isApplied(db) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)');
  return !!db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(VERSION);
}

export function migrate(db, direction) {
  const applied = isApplied(db);
  if (direction === 'up') {
    if (applied) return;
    const sql = fs.readFileSync(path.join(dir, `${VERSION}.up.sql`), 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)').run(VERSION, Date.now());
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  } else if (direction === 'down') {
    if (!applied) return;
    const sql = fs.readFileSync(path.join(dir, `${VERSION}.down.sql`), 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare('DELETE FROM schema_migrations WHERE version = ?').run(VERSION);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  } else {
    throw new Error('direction must be up or down');
  }
}
