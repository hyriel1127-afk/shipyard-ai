import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../../src/server.js';
import { hashPassword } from '../../src/auth.js';
import { setSink } from '../../src/logger.js';

export async function startApp(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qna-'));
  const programsPath = path.join(dir, 'programs.json');
  fs.writeFileSync(programsPath, JSON.stringify(opts.programs ?? ['PRGM0001', 'PRGM0002']));
  const app = await createApp({ dbPath: ':memory:', programsPath, port: 0, ...(opts.config ?? {}) });
  app.programsPath = programsPath;
  const close = app.close;
  app.close = async () => {
    await close();
    fs.rmSync(dir, { recursive: true, force: true });
  };
  return app;
}

export function seedUser(app, empNo, name, password, { answerer = false } = {}) {
  const r = app.db
    .prepare('INSERT INTO users(emp_no, name, password_hash) VALUES (?, ?, ?)')
    .run(empNo, name, hashPassword(password));
  if (answerer) app.db.prepare('INSERT INTO answerers(emp_no) VALUES (?)').run(empNo);
  return Number(r.lastInsertRowid);
}

export function captureLogs() {
  const lines = [];
  setSink((line) => lines.push(line));
  return {
    lines: () => lines.map((l) => JSON.parse(l)),
    text: () => lines.join('\n'),
    restore: () => setSink(null),
  };
}

export class Client {
  constructor(app) {
    this.base = app.url;
    this.cookie = '';
    this._csrf = null;
  }

  async request(method, urlPath, fields) {
    const headers = {};
    if (this.cookie) headers.cookie = this.cookie;
    let body;
    if (fields) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(fields)) {
        if (Array.isArray(v)) v.forEach((x) => params.append(k, x));
        else params.append(k, v);
      }
      body = params.toString();
      headers['content-type'] = 'application/x-www-form-urlencoded';
    }
    const res = await fetch(this.base + urlPath, { method, headers, body, redirect: 'manual' });
    for (const sc of res.headers.getSetCookie()) {
      const pair = sc.split(';')[0];
      if (pair.startsWith('sid=')) this.cookie = pair;
    }
    const text = await res.text();
    return { status: res.status, headers: res.headers, text, location: res.headers.get('location') };
  }

  get(urlPath) {
    return this.request('GET', urlPath);
  }

  async csrfToken() {
    const r = await this.get('/');
    const m = r.text.match(/name="csrf" value="([^"]+)"/);
    if (!m) throw new Error('csrf token not found, status=' + r.status);
    return m[1];
  }

  // opts.csrf: undefined=자동, false=생략, string=그 값 사용
  async post(urlPath, fields = {}, opts = {}) {
    const f = { ...fields };
    if (opts.csrf === undefined) f.csrf = this._csrf ?? (this._csrf = await this.csrfToken());
    else if (opts.csrf !== false) f.csrf = opts.csrf;
    return this.request('POST', urlPath, f);
  }

  async login(empNo, password) {
    const r = await this.request('POST', '/login', { emp_no: empNo, password });
    this._csrf = null;
    return r;
  }

  async newFormToken() {
    const r = await this.get('/questions/new');
    const m = r.text.match(/name="form_token" value="([^"]+)"/);
    if (!m) throw new Error('form_token not found, status=' + r.status);
    return m[1];
  }

  async ask(fields) {
    const form_token = fields.form_token ?? (await this.newFormToken());
    return this.post('/questions', { ...fields, form_token });
  }
}

export async function loggedInClient(app, empNo, password) {
  const c = new Client(app);
  const r = await c.login(empNo, password);
  if (r.status !== 303) throw new Error('login failed: ' + r.status);
  return c;
}
