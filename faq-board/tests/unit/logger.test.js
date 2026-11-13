import test from 'node:test';
import assert from 'node:assert/strict';
import { event } from '../../src/logger.js';
import { captureLogs } from '../helpers/server.js';

test('허용 필드만 JSON 한 줄로 기록하고 개인정보는 버린다', () => {
  const cap = captureLogs();
  try {
    event({ event: 'question.create', result: 'ok', ref_id: 3, user_id: 2, name: '홍길동', emp_no: 'EMP7731', body: '본문내용', title: '제목내용' });
    const lines = cap.lines();
    assert.equal(lines.length, 1);
    const l = lines[0];
    assert.deepEqual(Object.keys(l).sort(), ['at', 'event', 'ref_id', 'result', 'user_id']);
    assert.ok(!Number.isNaN(Date.parse(l.at)));
    const t = cap.text();
    for (const s of ['홍길동', 'EMP7731', '본문내용', '제목내용']) assert.ok(!t.includes(s), s);
  } finally {
    cap.restore();
  }
});
test('접근 로그 필드 method/route 는 허용하되 route 에 쿼리·숫자 id 가 있으면 버린다', () => {
  const cap = captureLogs();
  try {
    event({ event: 'http.access', result: '200', method: 'GET', route: '/questions/:id' });
    event({ event: 'http.access', result: '200', method: 'GET', route: '/questions/12?x=1' });
    const [a, b] = cap.lines();
    assert.equal(a.route, '/questions/:id');
    assert.equal(a.method, 'GET');
    assert.equal(b.route, undefined);
  } finally {
    cap.restore();
  }
});
