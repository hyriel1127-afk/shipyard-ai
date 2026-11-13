import { html, raw } from '../html.js';
import { M } from '../messages.js';
import { layout, errorBox } from './layout.js';

export function loginPage({ error, devLogin = false } = {}) {
  const content = html`<h2>${M.LOGIN}</h2>
${error ? errorBox(error) : raw('')}
<form method="post" action="/login">
  <p><label for="emp_no">${M.EMP_NO}</label><br>
  <input id="emp_no" name="emp_no" type="text" autocomplete="username" required></p>
  ${devLogin ? raw('') : html`<p><label for="password">${M.PASSWORD}</label><br>
  <input id="password" name="password" type="password" autocomplete="current-password" required></p>`}
  <p><button type="submit">${M.LOGIN}</button></p>
</form>`;
  return layout({ title: M.LOGIN, user: null, content });
}

export function messagePage({ title, message, user, csrf, linkHref, linkText }) {
  const content = html`${errorBox(message)}<p><a href="${linkHref}">${linkText}</a></p>`;
  return layout({ title, user: user ?? null, csrf, content });
}
