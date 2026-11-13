import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, seedUser, loggedInClient, captureLogs, Client, countRows, insertQuestion, insertAnswer } from '../helpers/server.js';

test('로그 전체에 사번·이름·제목·본문·쿼리스트링 값이 나오지 않는다', async () => {
  const app = await startApp();
  const logs = captureLogs();
  const stderr = [];
  const origErr = process.stderr.write.bind(process.stderr);
  process.stderr.write = (s) => (stderr.push(String(s)), true);
  try {
    await seedUser(app, 'EMP9001', '비밀이름가', 'pw-aaaa', { answerer: true });
    await seedUser(app, 'EMP9002', '비밀이름나', 'pw-bbbb');
    const a = await loggedInClient(app, 'EMP9001', 'pw-aaaa');
    const b = await loggedInClient(app, 'EMP9002', 'pw-bbbb');
    const q = await b.ask({ program_id: 'PRGM0001', title: '비밀제목QQ', body: '비밀본문QQ' });
    const id = q.location.split('/').pop();
    const tok = (await a.get(`/questions/${id}`)).text.match(/name="form_token" value="([^"]+)"/)[1];
    await a.post(`/questions/${id}/answers`, { body: '비밀답변QQ', form_token: tok });
    await b.post(`/questions/${id}/answers`, { body: '거부본문QQ', form_token: 'tok-denied-01' });
    await new Client(app).request('POST', '/login', { emp_no: 'EMP9001', password: '잘못된비번QQ' });
    await new Client(app).get('/questions/new');
    await b.ask({ program_id: '비밀ID형식', title: '', body: '' });
    await b.get('/?program_id=비밀쿼리QQ&page=1');
    await b.get('/questions/99999');
    const text = logs.text() + stderr.join('');
    assert.ok(text.length > 0);
    for (const s of ['EMP9001', 'EMP9002', '비밀이름', '비밀제목', '비밀본문', '비밀답변', '거부본문', '잘못된비번', '비밀쿼리', '비밀ID', 'program_id', 'PRGM0001']) {
      assert.ok(!text.includes(s), `로그에 "${s}" 노출`);
    }
    for (const e of logs.lines()) assert.ok(!('route' in e) || !/[?\d]/.test(e.route));
  } finally {
    process.stderr.write = origErr;
    logs.restore();
    await app.close();
  }
});
