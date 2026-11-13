import { html, raw } from '../html.js';
import { M, ERROR_TEXT } from '../messages.js';
import { layout } from './layout.js';

function fieldError(errors, field) {
  if (!errors[field]) return raw('');
  return html`<p id="err-${field}" class="error">${M.ERROR_PREFIX} ${ERROR_TEXT[errors[field]]}</p>`;
}
const describedBy = (errors, field) => (errors[field] ? raw(` aria-describedby="err-${field}"`) : raw(''));

export function questionFormPage({ user, csrf, formToken, values = {}, errors = {}, programIds = [] }) {
  const errorList = Object.values(errors);
  const summary = errorList.length
    ? html`<div role="alert" class="error-summary">
        <p>${M.ERROR_PREFIX} 입력 내용을 확인해 주세요.</p>
        <ul>${errorList.map((code) => html`<li>${ERROR_TEXT[code]}</li>`)}</ul>
      </div>`
    : raw('');
  const content = html`<h2>${M.NAV_NEW}</h2>
${summary}
<form method="post" action="/questions">
  <input type="hidden" name="csrf" value="${csrf}">
  <input type="hidden" name="form_token" value="${formToken}">
  <p><label for="program_id">${M.PROGRAM_ID}</label><br>
  <input id="program_id" name="program_id" type="text" list="program-list" value="${values.program_id ?? ''}" autocomplete="off"${describedBy(errors, 'program_id')}>
  <datalist id="program-list">${programIds.map((id) => html`<option value="${id}"></option>`)}</datalist>
  ${fieldError(errors, 'program_id')}</p>
  <p><label for="title">${M.TITLE}</label><br>
  <input id="title" name="title" type="text" size="60" value="${values.title ?? ''}"${describedBy(errors, 'title')}>
  ${fieldError(errors, 'title')}</p>
  <p><label for="body">${M.BODY}</label><br>
  <textarea id="body" name="body" rows="10" cols="60"${describedBy(errors, 'body')}>${values.body ?? ''}</textarea>
  ${fieldError(errors, 'body')}</p>
  <p><button type="submit">${M.SUBMIT_QUESTION}</button></p>
</form>`;
  return layout({ title: M.NAV_NEW, user, csrf, content });
}
