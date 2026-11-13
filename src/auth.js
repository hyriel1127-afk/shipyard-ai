import crypto from 'node:crypto';

const SESSION_MS = 8 * 60 * 60 * 1000;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

const DUMMY = hashPassword('dummy-password-for-timing');

// 성공하면 사용자 행, 실패하면 null. 사번 존재 여부는 구분하지 않는다.
export function authenticate(db, empNo, password) {
  const user = db.prepare('SELECT id, emp_no, name, password_hash FROM users WHERE emp_no = ?').get(String(empNo ?? ''));
  const ok = verifyPassword(String(password ?? ''), user ? user.password_hash : DUMMY);
  return user && ok ? user : null;
}

// 테스트 전용(QNA_DEV_LOGIN=1). 비밀번호를 확인하지 않는다.
export function authenticateDev(db, empNo) {
  return db.prepare('SELECT id, emp_no, name FROM users WHERE emp_no = ?').get(String(empNo ?? '')) ?? null;
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const csrf = crypto.randomBytes(16).toString('hex');
  db.prepare('INSERT INTO sessions(token_hash, user_id, csrf_token, expires_at) VALUES (?, ?, ?, ?)').run(
    sha256(token),
    userId,
    csrf,
    Date.now() + SESSION_MS,
  );
  return { token, csrf, maxAgeSec: SESSION_MS / 1000 };
}

export function getSession(db, token) {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT s.csrf_token AS csrf, s.expires_at, u.id AS user_id, u.emp_no, u.name
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
    )
    .get(sha256(token));
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    destroySession(db, token);
    return null;
  }
  return { csrf: row.csrf, user: { id: row.user_id, emp_no: row.emp_no, name: row.name } };
}

export function destroySession(db, token) {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

export function isAnswerer(db, empNo) {
  return !!db.prepare('SELECT 1 FROM answerers WHERE emp_no = ?').get(empNo);
}

export function parseCookies(header) {
  const out = {};
  for (const part of String(header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

export function sessionCookie(token, maxAgeSec) {
  return `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}`;
}
export const clearCookie = 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0';
