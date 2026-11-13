import { html, raw } from '../html.js';
import { M } from '../messages.js';
import { formatKst } from '../time.js';
import { layout } from './layout.js';

function pageHref(filter, page) {
  const q = [];
  if (filter) q.push(`program_id=${encodeURIComponent(filter)}`);
  if (page > 1) q.push(`page=${page}`);
  return q.length ? `/?${q.join('&')}` : '/';
}

export function questionListPage({ user, csrf, questions, filter = '', page = 1, hasNext = false, programIds = [] }) {
  const filterForm = html`<form method="get" action="/" class="filter">
  <label for="filter-program-id">${M.PROGRAM_ID}</label>
  <input id="filter-program-id" name="program_id" type="text" list="filter-program-list" value="${filter}" autocomplete="off">
  <datalist id="filter-program-list">${programIds.map((id) => html`<option value="${id}"></option>`)}</datalist>
  <button type="submit">${M.FILTER_BUTTON}</button>
  ${filter ? html`<a href="/">${M.CLEAR_FILTER}</a>` : raw('')}
</form>`;

  const table = questions.length
    ? html`<table>
        <thead><tr><th scope="col">${M.COL_TITLE}</th><th scope="col">${M.COL_PROGRAM}</th><th scope="col">${M.COL_DATE}</th><th scope="col">${M.COL_ANSWERS}</th></tr></thead>
        <tbody>${questions.map(
          (q) => html`<tr data-question-id="${q.id}"><td class="title"><a href="/questions/${q.id}">${q.title}</a></td><td class="program-id">${q.program_id}</td><td class="created-at">${formatKst(q.created_at)}</td><td class="answer-count">${q.answer_count}</td></tr>`,
        )}</tbody>
      </table>`
    : html`<p>${filter ? M.NO_MATCH : M.EMPTY_LIST}</p>`;

  const pager =
    page > 1 || hasNext
      ? html`<nav aria-label="페이지 이동" class="pager">
          ${page > 1 ? html`<a href="${pageHref(filter, page - 1)}">${M.PREV_PAGE}</a>` : raw('')}
          ${hasNext ? html`<a href="${pageHref(filter, page + 1)}">${M.NEXT_PAGE}</a>` : raw('')}
        </nav>`
      : raw('');

  const content = html`<h2>${M.NAV_LIST}</h2>${filterForm}${table}${pager}`;
  return layout({ title: M.NAV_LIST, user, csrf, content });
}
