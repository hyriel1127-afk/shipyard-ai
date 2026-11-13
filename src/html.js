const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => MAP[c]);
}

class SafeHtml {
  constructor(s) {
    this.s = s;
  }
  toString() {
    return this.s;
  }
}

export function raw(s) {
  return new SafeHtml(String(s));
}

function part(v) {
  if (v instanceof SafeHtml) return v.s;
  if (Array.isArray(v)) return v.map(part).join('');
  return esc(v);
}

// 보간 값은 자동 이스케이프. html`` 결과와 raw() 만 그대로 통과한다.
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => {
    out += part(v) + strings[i + 1];
  });
  return new SafeHtml(out);
}
