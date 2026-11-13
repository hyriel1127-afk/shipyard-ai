// 모든 POST 가 거치는 공통 검증. 실패 시 호출자는 HTTP 400 으로 응답한다.
const PROGRAM_ID_RE = /^[A-Z]{4}[0-9]{4}[A-Z]?$/;
const len = (s) => [...s].length; // 코드포인트 기준

function text(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function checkProgramId(raw, ctx) {
  if (Array.isArray(raw)) return { value: raw.join(','), error: 'PROGRAM_ID_FORMAT' };
  const v = text(raw);
  if (v === '') return { value: v, error: 'PROGRAM_ID_REQUIRED' };
  if (!PROGRAM_ID_RE.test(v)) return { value: v, error: 'PROGRAM_ID_FORMAT' };
  if (!ctx.programs.has(v)) return { value: v, error: 'PROGRAM_ID_UNKNOWN' };
  return { value: v };
}

function checkTitle(raw) {
  const v = text(raw);
  if (v === '') return { value: v, error: 'TITLE_REQUIRED' };
  if (len(v) > 100) return { value: v, error: 'TITLE_TOO_LONG' };
  return { value: v };
}

function checkBody(raw) {
  const v = text(raw);
  if (v === '') return { value: v, error: 'BODY_REQUIRED' };
  if (len(v) > 4000) return { value: v, error: 'BODY_TOO_LONG' };
  return { value: v };
}

const SCHEMAS = {
  question: { program_id: checkProgramId, title: checkTitle, body: checkBody },
  answer: { body: checkBody },
};

// validate('question' | 'answer', input, { programs }) → { ok, values, errors }
export function validate(schemaName, input, ctx) {
  const schema = SCHEMAS[schemaName];
  const values = {};
  const errors = {};
  for (const [field, check] of Object.entries(schema)) {
    const r = check(input[field], ctx);
    values[field] = r.value;
    if (r.error) errors[field] = r.error;
  }
  return Object.keys(errors).length ? { ok: false, values, errors } : { ok: true, values };
}
