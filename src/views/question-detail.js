import { html } from '../html.js';
import { M } from '../messages.js';
import { formatKst } from '../time.js';
import { layout } from './layout.js';

export function questionDetailPage({ user, csrf, question, answers }) {
  const answerList = answers.length
    ? html`<ol class="answers">${answers.map(
        (a) => html`<li><p class="answer-body">${a.body}</p><p class="meta">${M.AUTHOR}: ${a.author_name} · ${formatKst(a.created_at)}</p></li>`,
      )}</ol>`
    : html`<p>${M.NO_ANSWERS}</p>`;
  const content = html`<article>
  <h2>${question.title}</h2>
  <p class="meta">${M.PROGRAM_ID}: <span class="program-id">${question.program_id}</span> · ${M.AUTHOR}: ${question.author_name} · ${M.CREATED}: ${formatKst(question.created_at)}</p>
  <div class="question-body">${question.body}</div>
</article>
<section aria-labelledby="answers-heading"><h3 id="answers-heading">${M.ANSWERS} (${answers.length})</h3>${answerList}</section>
<p><a href="/">${M.BACK_TO_LIST}</a></p>`;
  return layout({ title: question.title, user, csrf, content });
}
