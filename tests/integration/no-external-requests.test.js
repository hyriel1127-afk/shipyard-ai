import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startApp, seedUser, loggedInClient, Client } from '../helpers/server.js';

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

test('src/, public/ 에 외부 URL(localhost·127.0.0.1 제외)이 없다', () => {
  const bad = [];
  for (const f of [...files('src'), ...files('public')]) {
    const text = fs.readFileSync(f, 'utf8');
    for (const m of text.matchAll(/https?:\/\/[^\s'"`)]+/g)) {
      if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(m[0])) bad.push(`${f}: ${m[0]}`);
    }
    if (f.endsWith('.css')) assert.ok(!/@import/.test(text), `${f} @import 사용`);
  }
  assert.deepEqual(bad, []);
});

test('모든 화면의 link/script/img 참조는 같은 출처이고 CSP 헤더가 있다', async () => {
  const app = await startApp();
  try {
    seedUser(app, 'EMP0001', '홍길동', 'pw-1234', { answerer: true });
    const c = await loggedInClient(app, 'EMP0001', 'pw-1234');
    const q = await c.ask({ program_id: 'PRGM0001', title: '제목', body: '내용' });
    const paths = ['/', '/login', '/questions/new', q.location, '/questions/9999', '/nothing'];
    for (const p of paths) {
      const r = await c.get(p);
      assert.equal(r.headers.get('content-security-policy'), "default-src 'self'", p);
      for (const m of r.text.matchAll(/<(?:link|script|img)\b[^>]*?(?:href|src)="([^"]*)"/g)) {
        assert.ok(m[1].startsWith('/') && !m[1].startsWith('//'), `${p}: ${m[1]}`);
      }
    }
    const anon = await new Client(app).get('/login');
    assert.equal(anon.headers.get('content-security-policy'), "default-src 'self'");
  } finally {
    await app.close();
  }
});
