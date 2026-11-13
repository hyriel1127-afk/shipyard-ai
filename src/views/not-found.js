import { M } from '../messages.js';
import { messagePage } from './login.js';

// 존재하지 않는 질문(404). 질문 목록으로 돌아가는 링크를 함께 보인다.
export function questionNotFoundPage({ user, csrf } = {}) {
  return messagePage({ title: M.QUESTION_NOT_FOUND, message: M.QUESTION_NOT_FOUND, user, csrf, linkHref: '/', linkText: M.BACK_TO_LIST });
}
