import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const FILES = ['src/snapshot.js', 'scripts/export-snapshot.js'];
const read = (f) => fs.readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');

test('내보내기 코드에 네트워크 모듈·호출·외부 URL이 없다 (헌법 V, FR-016)', () => {
  for (const f of FILES) {
    const src = read(f);
    assert.doesNotMatch(src, /node:(http|https|http2|net|tls|dgram|dns)\b/, f);
    assert.doesNotMatch(src, /\bfetch\s*\(/, f);
    assert.doesNotMatch(src, /https?:\/\//, f);
  }
});

test('외부 패키지가 추가되지 않았다 (헌법 II)', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
  assert.equal(pkg.scripts.snapshot, 'node scripts/export-snapshot.js');
});
