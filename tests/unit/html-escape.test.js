import test from 'node:test';
import assert from 'node:assert/strict';
import { esc, html, raw } from '../../src/html.js';

test('esc 는 5개 문자를 모두 이스케이프한다', () => {
  assert.equal(esc(`<>&"'`), '&lt;&gt;&amp;&quot;&#39;');
});
test('태그드 템플릿은 보간 값을 자동 이스케이프한다', () => {
  const out = String(html`<p>${'<script>alert(1)</script>'}</p>`);
  assert.equal(out, '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
});
test('raw 와 중첩 html 은 이스케이프하지 않는다', () => {
  assert.equal(String(html`<b>${raw('<i>x</i>')}</b>`), '<b><i>x</i></b>');
  assert.equal(String(html`<ul>${[1, 2].map((n) => html`<li>${n}</li>`)}</ul>`), '<ul><li>1</li><li>2</li></ul>');
});
