import { html, raw } from '../html.js';
import { M, ANSWER_ERROR_TEXT as ERROR_TEXT } from '../messages.js';
import { formatKst } from '../time.js';
import { layout } from './layout.js';

// 답변 입력란은 담당자에게만 보이는 부가 처리이며, 권한의 기준은 서버 검사다.
function answerForm({ csrf, question, answerToken, answerValues = {}, answerErrors = {} }) {
  const err = answerErrors.body;
  const summary = err ? html`<div role="alert" class="error-summary"><p>${M.ERROR_PREFIX} ${ERROR_TEXT[err]}</p></div>` : raw('');
  return html`<section aria-labelledby="answer-form-heading"><h3 id="answer-form-heading">${M.SUBMIT_ANSWER}</h3>
${summary}
<form method="post" action="/questions/${question.id}/answers">
  <input type="hidden" name="csrf" value="${csrf}">
  <input type="hidden" name="form_token" value="${answerToken}">
  <p><label for="answer-body">${M.ANSWER_BODY}</label><br>
  <textarea id="answer-body" name="body" rows="6" cols="60"${err ? raw(' aria-describedby="err-answer-body"') : raw('')}>${answerValues.body ?? ''}</textarea>
  ${err ? html`<p id="err-answer-body" class="error">${M.ERROR_PREFIX} ${ERROR_TEXT[err]}</p>` : raw('')}</p>
  <p><button type="submit">${M.SUBMIT_ANSWER}</button></p>
</form></section>`;
}

export function questionDetailPage({ user, csrf, question, answers, canAnswer = false, answerToken, answerValues, answerErrors }) {
  const answerList = answers.length
    ? html`<ol class="answers">${answers.map(
        (a) => html`<li><p class="answer-body">${a.body}</p><p class="meta">${M.AUTHOR}: ${a.author_name} · ${formatKst(a.created_at)}</p></li>`,
      )}</ol>`
    : html`<p>${M.NO_ANSWERS}</p>`;
  const form = canAnswer ? answerForm({ csrf, question, answerToken, answerValues, answerErrors }) : raw('');
  const content = html`<article>
  <h2>${question.title}</h2>
  <p class="meta">${M.PROGRAM_ID}: <span class="program-id">${question.program_id}</span> · ${M.AUTHOR}: ${question.author_name} · ${M.CREATED}: ${formatKst(question.created_at)}</p>
  <div class="question-body">${question.body}</div>
</article>
<section aria-labelledby="answers-heading"><h3 id="answers-heading">${M.ANSWERS} (${answers.length})</h3>${answerList}</section>
${form}
<p><a href="/">${M.BACK_TO_LIST}</a></p>`;
  return layout({ title: question.title, user, csrf, content });
}
