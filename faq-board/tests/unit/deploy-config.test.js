import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadConfig } from '../../src/config.js';
import { sessionCookie, clearCookie } from '../../src/auth.js';

const read = (f) => fs.readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');

test('Vercel 환경에서는 세션 쿠키에 Secure 가 붙고, 아니면 붙지 않는다', () => {
  assert.equal(loadConfig({ VERCEL: '1' }).secureCookie, true);
  assert.equal(loadConfig({ QNA_SECURE_COOKIE: '1' }).secureCookie, true);
  assert.equal(loadConfig({}).secureCookie, false);
  assert.match(sessionCookie('t', 10, true), /; Secure$/);
  assert.doesNotMatch(sessionCookie('t', 10), /Secure/);
  assert.match(clearCookie(true), /Max-Age=0; Secure$/);
  assert.match(sessionCookie('t', 10, true), /HttpOnly; SameSite=Lax/);
});

test('Vercel 에서는 비밀번호 없는 테스트 로그인이 켜지지 않는다', () => {
  assert.equal(loadConfig({ QNA_DEV_LOGIN: '1' }).devLogin, true);
  assert.equal(loadConfig({ QNA_DEV_LOGIN: '1', VERCEL: '1' }).devLogin, false);
});

test('DATABASE_URL 은 설정에서 읽되 기본값이 없다', () => {
  assert.equal(loadConfig({}).databaseUrl, undefined);
  assert.equal(loadConfig({ DATABASE_URL: 'postgresql://x' }).databaseUrl, 'postgresql://x');
});

test('vercel.json: 모든 경로를 api/index.js 로 보내고 정적 자원·프로그램 목록·마이그레이션을 함수에 포함한다', () => {
  const cfg = JSON.parse(read('vercel.json'));
  assert.deepEqual(cfg.rewrites, [{ source: '/(.*)', destination: '/api' }]);
  const inc = cfg.functions['api/index.js'].includeFiles;
  for (const p of ['public/**', 'data/programs.json', 'src/migrations/**']) assert.ok(inc.includes(p), p);
  assert.ok(fs.existsSync(new URL('../../api/index.js', import.meta.url)));
});

test('.env 는 git 에 올리지 않고, .env.example 에는 실제 접속 정보가 없다', () => {
  assert.match(read('.gitignore'), /^\.env$/m);
  assert.match(read('.env.example'), /^DATABASE_URL=postgresql:\/\/USER:PASSWORD@/m);
});

test('Vercel 진입점은 마이그레이션을 실행하지 않는다 (배포 전 npm run migrate 로 따로 실행)', () => {
  assert.doesNotMatch(read('api/index.js'), /migrate\(/);
});

test('서버 코드에 DB 접속 문자열·SQLite 의존이 남아 있지 않다', () => {
  for (const f of ['src/server.js', 'src/db.js', 'api/index.js', 'src/handlers/questions.js']) {
    assert.doesNotMatch(read(f), /node:sqlite|DatabaseSync|postgres(ql)?:\/\//, f);
  }
});
