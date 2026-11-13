import fs from 'node:fs';
import path from 'node:path';
import { formatKst } from './time.js';
import { event } from './logger.js';

// 모든 줄 앞에 '> '를 붙여 본문이 항목 경계('## 질문 N')를 흉내 내지 못하게 한다. 빈 줄은 '>'.
function quote(text) {
  return String(text)
    .split(/\r\n|\r|\n/)
    .map((line) => (line === '' ? '>' : `> ${line}`))
    .join('\n');
}

function groupByQuestion(answers) {
  const map = new Map();
  for (const a of answers) {
    if (!map.has(a.question_id)) map.set(a.question_id, []);
    map.get(a.question_id).push(a);
  }
  return map;
}

// 순수 함수: 조회 결과 → 마크다운. 형식은 specs/003-qna-snapshot/contracts/snapshot-file.md
export function renderSnapshot(questions, answers, nowMs) {
  const header = `생성 시각: ${formatKst(nowMs)} KST`;
  if (questions.length === 0) return `${header}\n\n내보낼 질문이 없습니다\n`;

  const byQuestion = groupByQuestion(answers);
  const parts = [header, '', '# QnA 스냅샷', ''];
  for (const q of questions) {
    parts.push(
      `## 질문 ${q.id}`,
      '',
      `- 프로그램 ID: ${q.program_id}`,
      `- 질문 등록일: ${formatKst(q.created_at)}`,
      '- 제목:',
      quote(q.title),
      '- 본문:',
      quote(q.body),
      '',
    );
    const list = byQuestion.get(q.id) ?? [];
    if (list.length === 0) {
      parts.push('### 답변 없음', '');
    } else {
      list.forEach((a, i) => {
        parts.push(`### 답변 ${i + 1}`, '', `- 답변 등록일: ${formatKst(a.created_at)}`, '- 본문:', quote(a.body), '');
      });
    }
  }
  return parts.join('\n');
}

function fail(code, message, cause) {
  const e = new Error(message, { cause });
  e.code = code;
  return e;
}

// DB에서 질문·답변을 읽는다. 읽기 전용 REPEATABLE READ 트랜잭션 하나로 한 시점의 내용만 얻는다.
// 작성자 컬럼(author_id)과 users 테이블은 조회하지 않는다.
async function readBoard(db, afterQuestionsRead) {
  try {
    return await db.tx(async (t) => {
      await t.exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
      const questions = await t.all('SELECT id, program_id, title, body, created_at FROM questions ORDER BY id ASC');
      if (afterQuestionsRead) await afterQuestionsRead();
      const answers = await t.all('SELECT question_id, body, created_at FROM answers ORDER BY id ASC');
      return { questions, answers };
    });
  } catch (e) {
    throw fail('DB_READ', 'board db unreadable', e);
  }
}

// 임시 파일에 쓴 뒤 교체한다. 실패해도 기존 파일은 그대로이고 임시 파일은 남지 않는다.
function writeAtomic(outPath, text) {
  const tmp = `${outPath}.tmp-${process.pid}`;
  try {
    fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
    fs.writeFileSync(tmp, text, 'utf8');
    fs.renameSync(tmp, outPath);
  } catch (e) {
    try { fs.rmSync(tmp, { force: true }); } catch {}
    throw fail('WRITE', 'snapshot write failed', e);
  }
}

// 게시판 DB의 질문·답변을 qna.md 한 파일로 내보낸다(DB는 읽기만 한다).
// 오류는 code 'DB_READ' | 'WRITE' 로 구분한다. afterQuestionsRead는 테스트 전용 훅이다.
export async function exportSnapshot({ db, outPath, now = Date.now(), afterQuestionsRead }) {
  try {
    const { questions, answers } = await readBoard(db, afterQuestionsRead);
    writeAtomic(outPath, renderSnapshot(questions, answers, now));
    event({ event: 'snapshot_export', result: 'ok' });
    return { questions: questions.length, answers: answers.length };
  } catch (e) {
    event({ event: 'snapshot_export', result: 'fail' }); // 로그에는 결과만 남긴다(경로·본문·개인정보 금지)
    throw e;
  }
}
