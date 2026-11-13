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
export async function authenticate(db, empNo, password) {
  const user = await db.get('SELECT id, emp_no, name, password_hash FROM users WHERE emp_no = $1', [String(empNo ?? '')]);
  const ok = verifyPassword(String(password ?? ''), user ? user.password_hash : DUMMY);
  return user && ok ? user : null;
}

// 테스트 전용(QNA_DEV_LOGIN=1). 비밀번호를 확인하지 않는다.
export async function authenticateDev(db, empNo) {
  return db.get('SELECT id, emp_no, name FROM users WHERE emp_no = $1', [String(empNo ?? '')]);
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export async function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const csrf = crypto.randomBytes(16).toString('hex');
  await db.run('INSERT INTO sessions(token_hash, user_id, csrf_token, expires_at) VALUES ($1, $2, $3, $4)', [
    sha256(token),
    userId,
    csrf,
    Date.now() + SESSION_MS,
  ]);
  return { token, csrf, maxAgeSec: SESSION_MS / 1000 };
}

export async function getSession(db, token) {
  if (!token) return null;
  const row = await db.get(
    `SELECT s.csrf_token AS csrf, s.expires_at, u.id AS user_id, u.emp_no, u.name
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1`,
    [sha256(token)],
  );
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    await destroySession(db, token);
    return null;
  }
  return { csrf: row.csrf, user: { id: row.user_id, emp_no: row.emp_no, name: row.name } };
}

export async function destroySession(db, token) {
  await db.run('DELETE FROM sessions WHERE token_hash = $1', [sha256(String(token ?? ''))]);
}

export async function isAnswerer(db, empNo) {
  return !!(await db.get('SELECT 1 AS x FROM answerers WHERE emp_no = $1', [empNo]));
}

export function parseCookies(header) {
  const out = {};
  for (const part of String(header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

// secure=true 이면 HTTPS 에서만 쿠키를 보낸다(Vercel 배포 기본).
export function sessionCookie(token, maxAgeSec, secure = false) {
  return `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`;
}
export const clearCookie = (secure = false) => `sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? '; Secure' : ''}`;
