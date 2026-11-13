// 로그는 이 함수 하나로만 남긴다. 허용 필드 외에는 버린다(이름·사번·본문 유입 차단).
let sink = null;

export function setSink(fn) {
  sink = fn;
}

export function event(fields) {
  const out = {
    event: String(fields.event),
    at: new Date().toISOString(),
    result: String(fields.result),
  };
  if (Number.isInteger(fields.ref_id)) out.ref_id = fields.ref_id;
  if (Number.isInteger(fields.user_id)) out.user_id = fields.user_id;
  if (fields.method === 'GET' || fields.method === 'POST') out.method = fields.method;
  if (typeof fields.route === 'string' && !/[?\d]/.test(fields.route)) out.route = fields.route;
  const line = JSON.stringify(out);
  if (sink) sink(line);
  else process.stdout.write(line + '\n');
}
