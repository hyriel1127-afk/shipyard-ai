import { authenticate, authenticateDev, createSession, destroySession, sessionCookie, clearCookie } from '../auth.js';
import { event } from '../logger.js';
import { M } from '../messages.js';
import { loginPage } from '../views/login.js';

export function loginForm(ctx) {
  ctx.send(200, loginPage({ devLogin: ctx.cfg.devLogin }));
}

export function loginSubmit(ctx) {
  const { db, body, cfg } = ctx;
  const user = cfg.devLogin ? authenticateDev(db, body.emp_no) : authenticate(db, body.emp_no, body.password);
  if (!user) {
    event({ event: 'login', result: 'denied' });
    return ctx.send(401, loginPage({ error: M.LOGIN_FAILED, devLogin: cfg.devLogin }));
  }
  const s = createSession(db, user.id);
  event({ event: 'login', result: 'ok', user_id: user.id });
  ctx.redirect('/', { 'set-cookie': sessionCookie(s.token, s.maxAgeSec) });
}

export function logout(ctx) {
  destroySession(ctx.db, ctx.sessionToken);
  ctx.redirect('/login', { 'set-cookie': clearCookie });
}
