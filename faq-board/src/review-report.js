// 답변 없는 질문과 오래된 답변을 정리한 점검 보고서(마크다운)를 만든다. DB는 조회만 한다.
// 작성자(author_id)와 users 테이블은 조회하지 않는다. 오류 문구는 고정 문구만 쓴다.
import { formatKst } from './time.js';

const DAY = 86_400_000;
const KST_OFFSET = 9 * 3_600_000;
export const DEFAULT_STALE_DAYS = 365;

// KST 달력 기준 일 번호. 같은 KST 날짜면 같은 값이다.
const kstDay = (ms) => Math.floor((ms + KST_OFFSET) / DAY);
const cell = (s) => String(s).replace(/[\r\n|]+/g, ' ').trim();

export async function buildReviewReport({ db, now = Date.now(), staleDays = DEFAULT_STALE_DAYS }) {
  let questions;
  let answerStats;
  try {
    questions = await db.all('SELECT id, program_id, title, created_at FROM questions ORDER BY id ASC');
    answerStats = await db.all(
      'SELECT question_id, COUNT(*)::int AS n, MAX(created_at) AS last_at FROM answers GROUP BY question_id',
    );
  } catch {
    throw new Error('게시판 DB를 읽을 수 없습니다.');
  }

  const today = kstDay(now);
  const stats = new Map(answerStats.map((a) => [a.question_id, a]));

  const unanswered = [];
  const stale = [];
  for (const q of questions) {
    const a = stats.get(q.id);
    if (!a) {
      unanswered.push({ ...q, days: today - kstDay(q.created_at) });
    } else {
      const days = today - kstDay(a.last_at);
      if (days >= staleDays) stale.push({ ...q, days, answers: a.n, lastAt: a.last_at });
    }
  }
  unanswered.sort((x, y) => y.days - x.days || x.id - y.id);
  stale.sort((x, y) => y.days - x.days || x.id - y.id);

  const date = formatKst(now).slice(0, 10);
  const lines = [
    `# QnA 게시판 점검 보고서 ${date}`,
    '',
    `- 생성 시각: ${formatKst(now)} KST`,
    `- 대상: 질문 전체 ${questions.length}건`,
    `- 기준: 오래된 답변은 질문의 마지막 답변 등록일로부터 ${staleDays}일 이상 지난 것 (KST 날짜 기준)`,
    '',
    '## 1. 요약',
    '',
    '| 구분 | 건수 |',
    '| --- | --- |',
    `| 전체 질문 | ${questions.length} |`,
    `| 답변 없는 질문 | ${unanswered.length} |`,
    `| 오래된 답변 (재검증 필요) | ${stale.length} |`,
    '',
    '## 2. 답변 없는 질문 (경과 일수 큰 순)',
    '',
  ];
  if (unanswered.length === 0) {
    lines.push('없음', '');
  } else {
    lines.push('| 질문 | 프로그램 ID | 등록일 | 경과 일수 | 제목 |', '| --- | --- | --- | --- | --- |');
    for (const q of unanswered) {
      lines.push(`| ${q.id} | ${q.program_id} | ${formatKst(q.created_at).slice(0, 10)} | ${q.days} | ${cell(q.title)} |`);
    }
    lines.push('');
  }
  lines.push(`## 3. 오래된 답변 (마지막 답변 후 ${staleDays}일 이상, 경과 일수 큰 순)`, '');
  if (stale.length === 0) {
    lines.push('없음', '');
  } else {
    lines.push(
      '| 질문 | 프로그램 ID | 질문 등록일 | 마지막 답변일 | 답변 후 경과 일수 | 답변 수 | 제목 |',
      '| --- | --- | --- | --- | --- | --- | --- |',
    );
    for (const q of stale) {
      lines.push(
        `| ${q.id} | ${q.program_id} | ${formatKst(q.created_at).slice(0, 10)} | ${formatKst(q.lastAt).slice(0, 10)} | ${q.days} | ${q.answers} | ${cell(q.title)} |`,
      );
    }
    lines.push('');
  }
  lines.push('## 4. 참고', '', '- 작성자 사번·이름은 포함하지 않습니다.', '- 모든 날짜는 KST입니다.', '');

  return { markdown: lines.join('\n'), date, counts: { total: questions.length, unanswered: unanswered.length, stale: stale.length } };
}
