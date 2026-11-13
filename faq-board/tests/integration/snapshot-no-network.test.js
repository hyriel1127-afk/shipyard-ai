import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const FILES = ['src/snapshot.js', 'scripts/export-snapshot.js'];
const read = (f) => fs.readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');

test('내보내기 코드에 직접적인 네트워크 모듈·호출·외부 URL이 없다 (헌법 V, FR-016)', () => {
  for (const f of FILES) {
    const src = read(f);
    assert.doesNotMatch(src, /node:(http|https|http2|net|tls|dgram|dns)\b/, f);
    assert.doesNotMatch(src, /\bfetch\s*\(/, f);
    assert.doesNotMatch(src, /https?:\/\//, f);
  }
});

test('외부 패키지는 DB 드라이버 1개(운영)와 테스트용 메모리 DB 1개(개발)뿐이다 (헌법 II 예외)', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.deepEqual(Object.keys(pkg.dependencies ?? {}), ['@neondatabase/serverless']);
  assert.deepEqual(Object.keys(pkg.devDependencies ?? {}), ['@electric-sql/pglite']);
  assert.equal(pkg.scripts.snapshot, 'node scripts/export-snapshot.js');
});
