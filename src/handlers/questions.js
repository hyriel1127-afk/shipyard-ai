import crypto from 'node:crypto';
import { validate } from '../validation.js';
import { isAnswerer } from '../auth.js';
import { event } from '../logger.js';
import { M } from '../messages.js';
import { questionFormPage } from '../views/question-form.js';
import { questionListPage } from '../views/question-list.js';
import { questionDetailPage } from '../views/question-detail.js';
import { messagePage } from '../views/login.js';
import { questionNotFoundPage } from '../views/not-found.js';

// 읽기 화면은 미로그인(session=null)일 수 있다.
const view = (ctx) => ({ user: ctx.session?.user ?? null, csrf: ctx.session?.csrf });

export function newForm(ctx) {
  ctx.send(200, questionFormPage({ ...view(ctx), formToken: crypto.randomUUID(), programIds: ctx.programs.list() }));
}

function existingByToken(db, token) {
  return db.get('SELECT id FROM questions WHERE form_token = $1', [token]);
}

export async function create(ctx) {
  const { db, body, programs, session } = ctx;
  if (programs.state() === 'unavailable') {
    event({ event: 'question.create', result: 'error', user_id: session.user.id });
    return ctx.send(503, messagePage({ title: M.NAV_NEW, message: M.PROGRAMS_UNAVAILABLE, ...view(ctx), linkHref: '/', linkText: M.BACK_TO_LIST }));
  }
  const token = typeof body.form_token === 'string' && body.form_token.length >= 8 && body.form_token.length <= 100 ? body.form_token : crypto.randomUUID();
  const v = validate('question', { program_id: body.program_id, title: body.title, body: body.body }, { programs });
  if (!v.ok) {
    event({ event: 'question.create', result: 'invalid', user_id: session.user.id });
    return ctx.send(400, questionFormPage({ ...view(ctx), formToken: token, values: v.values, errors: v.errors, programIds: programs.list() }));
  }
  const dup = await existingByToken(db, token);
  if (dup) return ctx.redirect(`/questions/${dup.id}`);
  let id;
  try {
    const r = await db.get(
      'INSERT INTO questions(program_id, title, body, author_id, created_at, form_token) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [v.values.program_id, v.values.title, v.values.body, session.user.id, Date.now(), token],
    );
    id = r.id;
  } catch (e) {
    const again = await existingByToken(db, token);
    if (!again) throw e;
    return ctx.redirect(`/questions/${again.id}`);
  }
  event({ event: 'question.create', result: 'ok', ref_id: id, user_id: session.user.id });
  ctx.redirect(`/questions/${id}`);
}

const PAGE_SIZE = 20;
const SELECT_LIST = `SELECT q.id, q.program_id, q.title, q.created_at,
              (SELECT COUNT(*)::int FROM answers a WHERE a.question_id = q.id) AS answer_count
       FROM questions q`;

// 프로그램 ID 필터는 검색 색인이 아니라 program_id 열 조건(정확 일치)이다.
// 형식 오류·미등록 값도 검증하지 않고 그대로 조회하며, 0건이면 빈 목록이 된다.
export async function list(ctx) {
  const rawFilter = ctx.url.searchParams.get('program_id');
  const filter = rawFilter === null ? '' : rawFilter.trim();
  const rawPage = ctx.url.searchParams.get('page') ?? '';
  const page = /^\d+$/.test(rawPage) && Number(rawPage) >= 1 ? Number(rawPage) : 1;
  const offset = (page - 1) * PAGE_SIZE;

  const rows = filter
    ? await ctx.db.all(`${SELECT_LIST} WHERE q.program_id = $1 ORDER BY q.id DESC LIMIT $2 OFFSET $3`, [filter, PAGE_SIZE + 1, offset])
    : await ctx.db.all(`${SELECT_LIST} ORDER BY q.id DESC LIMIT $1 OFFSET $2`, [PAGE_SIZE + 1, offset]);
  const hasNext = rows.length > PAGE_SIZE;
  ctx.send(200, questionListPage({ ...view(ctx), questions: rows.slice(0, PAGE_SIZE), filter, page, hasNext, programIds: ctx.programs.list() }));
}

export async function findQuestion(db, id) {
  return /^[1-9]\d{0,15}$/.test(id) // 양의 정수만 허용(int 범위를 넘는 값은 ::bigint 비교로 0건이 된다)
    ? db.get(
        `SELECT q.id, q.program_id, q.title, q.body, q.created_at, u.name AS author_name
         FROM questions q JOIN users u ON u.id = q.author_id WHERE q.id = $1::bigint`,
        [id],
      )
    : null;
}

// 상세 렌더링. 답변 400 재렌더링에서도 재사용한다(status, answerForm 으로 입력·오류 전달).
export async function renderDetail(ctx, question, { status = 200, answerForm = {} } = {}) {
  const answers = await ctx.db.all(
    `SELECT a.id, a.body, a.created_at, u.name AS author_name
     FROM answers a JOIN users u ON u.id = a.author_id WHERE a.question_id = $1 ORDER BY a.id ASC`,
    [question.id],
  );
  const canAnswer = !!ctx.session && (await isAnswerer(ctx.db, ctx.session.user.emp_no));
  ctx.send(
    status,
    questionDetailPage({
      ...view(ctx),
      question,
      answers,
      canAnswer,
      answerToken: canAnswer ? answerForm.formToken ?? crypto.randomUUID() : undefined,
      answerValues: answerForm.values,
      answerErrors: answerForm.errors,
    }),
  );
}

export async function detail(ctx) {
  const question = await findQuestion(ctx.db, ctx.params.id);
  if (!question) return ctx.send(404, questionNotFoundPage(view(ctx)));
  await renderDetail(ctx, question);
}
