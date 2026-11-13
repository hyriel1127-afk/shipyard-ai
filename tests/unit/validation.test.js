import test from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../../src/validation.js';

const programs = { has: (id) => ['PRGM0001', 'PRGM0002A'].includes(id) };
const ctx = { programs };
const q = (over = {}) => ({ program_id: 'PRGM0001', title: '제목', body: '내용', ...over });
const errOf = (input) => validate('question', input, ctx).errors?.program_id;

test('정상 입력은 ok 이고 앞뒤 공백이 제거된 값을 돌려준다', () => {
  const r = validate('question', q({ program_id: ' PRGM0001 ', title: ' 제목 ', body: ' 내용 ' }), ctx);
  assert.equal(r.ok, true);
  assert.deepEqual(r.values, { program_id: 'PRGM0001', title: '제목', body: '내용' });
});
test('9자 형식(끝에 대문자 1자)도 통과한다', () => {
  assert.equal(validate('question', q({ program_id: 'PRGM0002A' }), ctx).ok, true);
});
test('프로그램 ID 누락(없음/빈 값/공백만) → PROGRAM_ID_REQUIRED', () => {
  assert.equal(errOf({ title: 't', body: 'b' }), 'PROGRAM_ID_REQUIRED');
  assert.equal(errOf(q({ program_id: '' })), 'PROGRAM_ID_REQUIRED');
  assert.equal(errOf(q({ program_id: '   ' })), 'PROGRAM_ID_REQUIRED');
});
test('프로그램 ID 형식 오류 → PROGRAM_ID_FORMAT', () => {
  for (const bad of ['prg 1', 'prgm0001', 'PRGM001', 'PRG0001', 'PRGM00011', 'PRGM0001a', 'PRGM0001AB', 'PRGM-001', 'ABCDE0001']) {
    assert.equal(errOf(q({ program_id: bad })), 'PROGRAM_ID_FORMAT', bad);
  }
});
test('프로그램 ID 가 여러 개(배열) → PROGRAM_ID_FORMAT', () => {
  assert.equal(errOf(q({ program_id: ['PRGM0001', 'PRGM0002A'] })), 'PROGRAM_ID_FORMAT');
});
test('형식은 맞지만 목록에 없음 → PROGRAM_ID_UNKNOWN', () => {
  assert.equal(errOf(q({ program_id: 'PRGM9999' })), 'PROGRAM_ID_UNKNOWN');
});
test('제목: 공백만 → TITLE_REQUIRED, 100자 통과, 101자 → TITLE_TOO_LONG', () => {
  assert.equal(validate('question', q({ title: '   ' }), ctx).errors.title, 'TITLE_REQUIRED');
  assert.equal(validate('question', q({ title: '가'.repeat(100) }), ctx).ok, true);
  assert.equal(validate('question', q({ title: '가'.repeat(101) }), ctx).errors.title, 'TITLE_TOO_LONG');
});
test('글자 수는 코드포인트 기준이다', () => {
  assert.equal(validate('question', q({ title: '😀'.repeat(100) }), ctx).ok, true);
});
test('내용: 공백만 → BODY_REQUIRED, 4000자 통과, 4001자 → BODY_TOO_LONG', () => {
  assert.equal(validate('question', q({ body: '  ' }), ctx).errors.body, 'BODY_REQUIRED');
  assert.equal(validate('question', q({ body: 'a'.repeat(4000) }), ctx).ok, true);
  assert.equal(validate('question', q({ body: 'a'.repeat(4001) }), ctx).errors.body, 'BODY_TOO_LONG');
});
test('여러 필드 오류를 한꺼번에 돌려주고 입력값을 보존한다', () => {
  const r = validate('question', { program_id: 'x', title: '', body: '' }, ctx);
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ['body', 'program_id', 'title']);
  assert.equal(r.values.program_id, 'x');
});
test('답변 스키마: body 만 검사한다', () => {
  assert.equal(validate('answer', { body: '  ' }, ctx).errors.body, 'BODY_REQUIRED');
  assert.equal(validate('answer', { body: 'a'.repeat(4001) }, ctx).errors.body, 'BODY_TOO_LONG');
  assert.equal(validate('answer', { body: '답변' }, ctx).ok, true);
});
