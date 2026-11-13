import { M } from '../messages.js';
import { messagePage } from '../views/login.js';

// US3(T044)에서 구현한다. 지금은 라우트만 등록해 인증·CSRF 검사가 먼저 적용되게 하고,
// 로그인한 사용자에게는 아무것도 저장하지 않은 채 404 를 돌려준다.
export function create(ctx) {
  ctx.send(
    404,
    messagePage({ title: M.PAGE_NOT_FOUND, message: M.PAGE_NOT_FOUND, user: ctx.session.user, csrf: ctx.session.csrf, linkHref: '/', linkText: M.BACK_TO_LIST }),
  );
}
