import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { connectNeon, migrate } from './db.js';
import { createPrograms } from './programs.js';
import { getSession, parseCookies } from './auth.js';
import { event } from './logger.js';
import { M } from './messages.js';
import { messagePage } from './views/login.js';
import { loginForm, loginSubmit, logout } from './handlers/login.js';
import * as questions from './handlers/questions.js';
import * as answers from './handlers/answers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_BODY = 1024 * 1024;

// [method, 경로 정규식, 로그용 경로 템플릿, 인증, 핸들러]
// 인증: true=로그인 필수, 'optional'=읽기 공개(로그인했으면 사용자 표시), false=불필요
const routes = [
  ['GET', /^\/login$/, '/login', false, loginForm],
  ['POST', /^\/login$/, '/login', false, loginSubmit],
  ['POST', /^\/logout$/, '/logout', true, logout],
  ['GET', /^\/$/, '/', 'optional', questions.list],
  ['GET', /^\/questions\/new$/, '/questions/new', true, questions.newForm],
  ['POST', /^\/questions$/, '/questions', true, questions.create],
  ['GET', /^\/questions\/([^/]+)$/, '/questions/:id', 'optional', questions.detail],
  ['POST', /^\/questions\/([^/]+)\/answers$/, '/questions/:id/answers', true, answers.create],
];

function fromParsed(body) {
  const out = {};
  const params = typeof body === 'string' || Buffer.isBuffer(body) ? new URLSearchParams(body.toString('utf8')) : null;
  if (params) {
    for (const [k, v] of params) out[k] = k in out ? [].concat(out[k], v) : v;
  } else if (body && typeof body === 'object') {
    for (const [k, v] of Object.entries(body)) out[k] = v;
  }
  return out;
}

function readBody(req) {
  // Vercel Node 런타임은 req.body 를 먼저 해석해 줄 수 있다. 있으면 스트림 대신 그것을 쓴다.
  if (req.body !== undefined && req.body !== null) return Promise.resolve(fromParsed(req.body));
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('body too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      const out = {};
      for (const [k, v] of new URLSearchParams(Buffer.concat(chunks).toString('utf8'))) {
        if (k in out) out[k] = [].concat(out[k], v);
        else out[k] = v;
      }
      resolve(out);
    });
    req.on('error', reject);
  });
}

// 요청 처리기. 로컬 http 서버와 Vercel 함수(api/index.js)가 같은 처리기를 쓴다.
export function createHandler({ db, cfg, programs }) {
  const css = fs.readFileSync(path.join(root, 'public', 'style.css'));

  return async (req, res) => {
    let routeTemplate = '/:unknown';
    res.on('finish', () => {
      event({ event: 'http.access', result: String(res.statusCode), method: req.method === 'POST' ? 'POST' : 'GET', route: routeTemplate });
    });
    const send = (status, body, headers = {}) => {
      res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', ...headers });
      res.end(body);
    };
    res.setHeader('Content-Security-Policy', "default-src 'self'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/static/style.css') {
        routeTemplate = '/static/style.css';
        return send(200, css, { 'content-type': 'text/css; charset=utf-8' });
      }
      let match = null;
      let params = {};
      for (const r of routes) {
        if (r[0] !== req.method) continue;
        const m = r[1].exec(url.pathname);
        if (m) {
          match = r;
          params = { id: m[1] };
          break;
        }
      }
      if (!match) {
        return send(404, messagePage({ title: M.PAGE_NOT_FOUND, message: M.PAGE_NOT_FOUND, linkHref: '/', linkText: M.BACK_TO_LIST }));
      }
      const [method, , template, needAuth, handler] = match;
      routeTemplate = template;
      const body = method === 'POST' ? await readBody(req) : {};
      if (method === 'POST' && cfg.readonly && template !== '/login') {
        return send(503, messagePage({ title: M.READONLY, message: M.READONLY, linkHref: '/', linkText: M.BACK_TO_LIST }));
      }
      const sessionToken = parseCookies(req.headers.cookie).sid;
      let session = null;
      if (needAuth) {
        session = await getSession(db, sessionToken);
        if (!session && needAuth !== 'optional') {
          event({ event: 'auth.required', result: 'denied' });
          return send(401, messagePage({ title: M.LOGIN_REQUIRED, message: M.LOGIN_REQUIRED, linkHref: '/login', linkText: M.LOGIN }));
        }
        if (session && method === 'POST' && body.csrf !== session.csrf) {
          return send(403, messagePage({ title: M.BAD_REQUEST, message: M.BAD_REQUEST, user: session.user, csrf: session.csrf, linkHref: '/', linkText: M.BACK_TO_LIST }));
        }
      }
      const ctx = {
        req,
        url,
        params,
        db,
        programs,
        cfg,
        body,
        session,
        sessionToken,
        send,
        redirect: (location, headers = {}) => {
          res.writeHead(303, { location, ...headers });
          res.end();
        },
      };
      await handler(ctx);
    } catch (err) {
      event({ event: 'http.access', result: 'error' });
      if (!res.headersSent) send(500, messagePage({ title: M.SERVER_ERROR, message: M.SERVER_ERROR, linkHref: '/', linkText: M.BACK_TO_LIST }));
      else res.end();
    }
  };
}


// 로컬 실행용 서버. opts.db 를 주면 그것을 쓰고(테스트), 없으면 DATABASE_URL 로 Neon 에 연결한다.
// 마이그레이션은 opts.migrate 가 true 일 때만 자동 실행한다(Vercel 에서는 배포 전에 npm run migrate 로 따로 실행).
export async function createApp(opts = {}) {
  const { db: injected, migrate: autoMigrate = false, ...rest } = opts;
  const cfg = { ...loadConfig(), ...rest };
  const db = injected ?? connectNeon(cfg.databaseUrl);
  if (autoMigrate) await migrate(db, 'up');
  const programs = createPrograms(cfg.programsPath);
  const server = http.createServer(createHandler({ db, cfg, programs }));

  await new Promise((resolve) => server.listen(cfg.port, cfg.host ?? '127.0.0.1', resolve));
  const port = server.address().port;
  return {
    server,
    db,
    port,
    url: `http://127.0.0.1:${port}`,
    close: async () => {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
      await db.close();
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await import('./env.js');
  const app = await createApp({ ...loadConfig(), migrate: true });
  console.log(`listening on ${app.url}`);
}
