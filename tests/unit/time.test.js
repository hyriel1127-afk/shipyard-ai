import test from 'node:test';
import assert from 'node:assert/strict';
import { formatKst } from '../../src/time.js';

test('UTC 2026-11-12 15:30 은 KST 2026-11-13 00:30', () => {
  assert.equal(formatKst(Date.UTC(2026, 10, 12, 15, 30)), '2026-11-13 00:30');
});
test('UTC 14:59 는 같은 날 23:59', () => {
  assert.equal(formatKst(Date.UTC(2026, 10, 12, 14, 59)), '2026-11-12 23:59');
});
test('UTC 15:00 은 다음 날 00:00 (자정 경계)', () => {
  assert.equal(formatKst(Date.UTC(2026, 10, 12, 15, 0)), '2026-11-13 00:00');
});
