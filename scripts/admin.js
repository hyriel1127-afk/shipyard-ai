import { loadConfig } from '../src/config.js';
import { openDb, migrate } from '../src/db.js';
import { hashPassword } from '../src/auth.js';

const [cmd, a, b, c] = process.argv.slice(2);
const db = openDb(loadConfig().dbPath);
migrate(db, 'up');

const usage = () => {
  console.error('사용법:\n  add-user <사번> <이름> <비밀번호>\n  set-password <사번> <비밀번호>\n  add-answerer <사번>\n  remove-answerer <사번>');
  process.exit(1);
};

if (cmd === 'add-user' && a && b && c) {
  db.prepare('INSERT INTO users(emp_no, name, password_hash) VALUES (?, ?, ?)').run(a, b, hashPassword(c));
  console.log('사용자를 등록했습니다.');
} else if (cmd === 'set-password' && a && b) {
  const r = db.prepare('UPDATE users SET password_hash = ? WHERE emp_no = ?').run(hashPassword(b), a);
  console.log(r.changes ? '비밀번호를 바꿨습니다.' : '해당 사번의 사용자가 없습니다.');
} else if (cmd === 'add-answerer' && a) {
  db.prepare('INSERT OR IGNORE INTO answerers(emp_no) VALUES (?)').run(a);
  console.log('답변 담당자로 지정했습니다.');
} else if (cmd === 'remove-answerer' && a) {
  db.prepare('DELETE FROM answerers WHERE emp_no = ?').run(a);
  console.log('답변 담당자에서 제외했습니다.');
} else {
  usage();
}
db.close();
