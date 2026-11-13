import crypto from 'node:crypto';
import { validate } from '../validation.js';
import { isAnswerer } from '../auth.js';
import { event } from '../logger.js';
import { M } from '../messages.js';
import { messagePage } from '../views/login.js';
import { questionNotFoundPage } from '../views/not-found.js';
import { findQuestion, renderDetail } from './questions.js';

// 검사 순서: 로그인(401, server.js) → CSRF(403, server.js) → 답변 담당자(403) → 질문 존재(404) → 검증(400) → 저장
export function create(ctx) {
  const { db, body, session } = ctx;
  const userId = session.user.id;
  const page = { user: session.user, csrf: session.csrf };

  if (!isAnswerer(db, session.user.emp_no)) {
    event({ event: 'auth.denied', result: 'denied', user_id: userId });
    return ctx.send(403, messagePage({ title: M.NO_ANSWER_PERMISSION, message: M.NO_ANSWER_PERMISSION, ...page, linkHref: '/', linkText: M.BACK_TO_LIST }));
  }
  const question = findQuestion(db, ctx.params.id);
  if (!question) {
    event({ event: 'answer.create', result: 'not_found', user_id: userId });
    return ctx.send(404, questionNotFoundPage(page));
  }

  const token = typeof body.form_token === 'string' && body.form_token.length >= 8 && body.form_token.length <= 100 ? body.form_token : crypto.randomUUID();
  const v = validate('answer', { body: body.body }, { programs: ctx.programs });
  if (!v.ok) {
    event({ event: 'answer.create', result: 'invalid', ref_id: question.id, user_id: userId });
    return renderDetail(ctx, question, { status: 400, answerForm: { formToken: token, values: v.values, errors: v.errors } });
  }

  const existing = db.prepare('SELECT question_id FROM answers WHERE form_token = ?').get(token);
  if (existing) return ctx.redirect(`/questions/${existing.question_id}`);
  try {
    const r = db
      .prepare('INSERT INTO answers(question_id, body, author_id, created_at, form_token) VALUES (?, ?, ?, ?, ?)')
      .run(question.id, v.values.body, userId, Date.now(), token);
    event({ event: 'answer.create', result: 'ok', ref_id: Number(r.lastInsertRowid), user_id: userId });
  } catch (e) {
    const again = db.prepare('SELECT question_id FROM answers WHERE form_token = ?').get(token);
    if (!again) throw e;
  }
  ctx.redirect(`/questions/${question.id}`);
}
