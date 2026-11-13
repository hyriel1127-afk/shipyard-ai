// 사용자에게 보이는 모든 문구(한국어)는 이 파일에서만 정의한다.
export const M = {
  LOGIN_REQUIRED: '로그인이 필요합니다.',
  NO_ANSWER_PERMISSION: '답변 권한이 없습니다.',
  QUESTION_NOT_FOUND: '존재하지 않는 질문입니다.',
  PAGE_NOT_FOUND: '존재하지 않는 페이지입니다.',
  BAD_REQUEST: '요청이 올바르지 않습니다. 화면을 새로 고친 뒤 다시 시도해 주세요.',
  SERVER_ERROR: '서버에서 오류가 발생했습니다.',
  READONLY: '현재 읽기 전용 상태라 등록할 수 없습니다.',
  PROGRAMS_UNAVAILABLE: '프로그램 ID 목록을 읽을 수 없어 질문을 등록할 수 없습니다.',
  LOGIN_FAILED: '사번 또는 비밀번호가 올바르지 않습니다.',

  PROGRAM_ID_REQUIRED: '프로그램 ID를 입력해 주세요.',
  PROGRAM_ID_FORMAT: '프로그램 ID 형식이 올바르지 않습니다.',
  PROGRAM_ID_UNKNOWN: '등록되지 않은 프로그램 ID입니다.',
  TITLE_REQUIRED: '제목을 입력해 주세요.',
  TITLE_TOO_LONG: '제목은 100자 이내로 입력해 주세요.',
  BODY_REQUIRED: '내용을 입력해 주세요.',
  BODY_TOO_LONG: '내용은 4,000자 이내로 입력해 주세요.',
  ANSWER_REQUIRED: '답변 내용을 입력해 주세요.',
  ANSWER_TOO_LONG: '답변은 4,000자 이내로 입력해 주세요.',
  SUBMIT_ANSWER: '답변 등록',
  ANSWER_BODY: '답변 내용',

  EMPTY_LIST: '등록된 질문이 없습니다.',
  NO_MATCH: '해당 프로그램 ID의 질문이 없습니다.',
  FILTER_BUTTON: '조회',
  CLEAR_FILTER: '필터 해제',
  PREV_PAGE: '이전 페이지',
  NEXT_PAGE: '다음 페이지',
  NO_ANSWERS: '아직 답변이 없습니다.',

  ERROR_PREFIX: '오류:',
  APP_TITLE: '사내 프로그램 문의 게시판',
  NAV_LIST: '질문 목록',
  NAV_NEW: '질문하기',
  LOGOUT: '로그아웃',
  LOGIN: '로그인',
  EMP_NO: '사번',
  PASSWORD: '비밀번호',
  PROGRAM_ID: '프로그램 ID',
  TITLE: '제목',
  BODY: '내용',
  SUBMIT_QUESTION: '등록',
  BACK_TO_LIST: '질문 목록으로 돌아가기',
  COL_TITLE: '제목',
  COL_PROGRAM: '프로그램 ID',
  COL_DATE: '작성일',
  COL_ANSWERS: '답변 수',
  AUTHOR: '작성자',
  CREATED: '작성일시',
  ANSWERS: '답변',
};

export const ERROR_TEXT = {
  PROGRAM_ID_REQUIRED: M.PROGRAM_ID_REQUIRED,
  PROGRAM_ID_FORMAT: M.PROGRAM_ID_FORMAT,
  PROGRAM_ID_UNKNOWN: M.PROGRAM_ID_UNKNOWN,
  TITLE_REQUIRED: M.TITLE_REQUIRED,
  TITLE_TOO_LONG: M.TITLE_TOO_LONG,
  BODY_REQUIRED: M.BODY_REQUIRED,
  BODY_TOO_LONG: M.BODY_TOO_LONG,
};

// 답변 화면 전용: 공통 검증 코드(BODY_*)를 답변 문구로 바꾼다.
export const ANSWER_ERROR_TEXT = {
  BODY_REQUIRED: M.ANSWER_REQUIRED,
  BODY_TOO_LONG: M.ANSWER_TOO_LONG,
};
