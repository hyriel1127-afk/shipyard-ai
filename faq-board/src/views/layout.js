import { html, raw } from '../html.js';
import { M } from '../messages.js';

// content 는 html`` 결과(안전한 조각)여야 한다.
export function layout({ title, user, csrf, content }) {
  const nav = user
    ? html`<nav aria-label="주 메뉴">
        <a href="/">${M.NAV_LIST}</a>
        <a href="/questions/new">${M.NAV_NEW}</a>
        <span class="user">${user.name}</span>
        <form method="post" action="/logout" class="inline">
          <input type="hidden" name="csrf" value="${csrf}">
          <button type="submit">${M.LOGOUT}</button>
        </form>
      </nav>`
    : html`<nav aria-label="주 메뉴">
        <a href="/">${M.NAV_LIST}</a>
        <a href="/login">${M.LOGIN}</a>
      </nav>`;
  return String(html`<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} - ${M.APP_TITLE}</title>
<link rel="stylesheet" href="/static/style.css">
</head>
<body>
<header><h1>${M.APP_TITLE}</h1>${nav}</header>
<main>${content}</main>
</body>
</html>`);
}

export function errorBox(message) {
  return html`<p role="alert" class="error">${M.ERROR_PREFIX} ${message}</p>`;
}
