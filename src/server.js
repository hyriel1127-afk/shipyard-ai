import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { openDb, migrate } from './db.js';
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

function readBody(req) {
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

export async function createApp(opts = {}) {
  const cfg = { ...loadConfig(), ...opts };
  const db = openDb(cfg.dbPath);
  migrate(db, 'up');
  const programs = createPrograms(cfg.programsPath);
  const css = fs.readFileSync(path.join(root, 'public', 'style.css'));

  const server = http.createServer(async (req, res) => {
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
        session = getSession(db, sessionToken);
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
  });

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
      db.close();
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = await createApp();
  console.log(`listening on ${app.url}`);
}
