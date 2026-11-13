// 사용자·답변 담당자 관리. 대상: DATABASE_URL(Neon). 사용법은 인자 없이 실행하면 출력된다.
import '../src/env.js';
import { loadConfig } from '../src/config.js';
import { connectNeon, migrate } from '../src/db.js';
import { hashPassword } from '../src/auth.js';

const [cmd, a, b, c] = process.argv.slice(2);
const usage = () => {
  console.error('사용법:\n  add-user <사번> <이름> <비밀번호>\n  set-password <사번> <비밀번호>\n  add-answerer <사번>\n  remove-answerer <사번>');
  process.exit(1);
};
const valid =
  (cmd === 'add-user' && a && b && c) ||
  (cmd === 'set-password' && a && b) ||
  ((cmd === 'add-answerer' || cmd === 'remove-answerer') && a);
if (!valid) usage();

let db;
try {
  db = connectNeon(loadConfig().databaseUrl);
  await migrate(db, 'up');
  if (cmd === 'add-user') {
    await db.run('INSERT INTO users(emp_no, name, password_hash) VALUES ($1, $2, $3)', [a, b, hashPassword(c)]);
    console.log('사용자를 등록했습니다.');
  } else if (cmd === 'set-password') {
    const r = await db.run('UPDATE users SET password_hash = $1 WHERE emp_no = $2', [hashPassword(b), a]);
    console.log(r.rowCount ? '비밀번호를 바꿨습니다.' : '해당 사번의 사용자가 없습니다.');
  } else if (cmd === 'add-answerer') {
    await db.run('INSERT INTO answerers(emp_no) VALUES ($1) ON CONFLICT DO NOTHING', [a]);
    console.log('답변 담당자로 지정했습니다.');
  } else {
    await db.run('DELETE FROM answerers WHERE emp_no = $1', [a]);
    console.log('답변 담당자에서 제외했습니다.');
  }
} catch {
  console.error('작업을 실행하지 못했습니다. DATABASE_URL과 입력값(중복 사번 등)을 확인하세요.');
  process.exitCode = 1;
} finally {
  try { await db?.close(); } catch {}
}
