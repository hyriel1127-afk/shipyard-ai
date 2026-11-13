// 주간 점검 보고서를 reports/digest-YYYY-MM-DD.md 로 만든다(DB는 읽기 전용). 사용: npm run digest
// 입력 DB: QNA_DB, 출력 폴더: QNA_REPORTS_DIR (기본 ./reports)
// 작성자(author_id)와 users 테이블은 조회하지 않는다. 오류 문구는 고정 문구만 쓴다.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import './resolve-db.js';
import { loadConfig } from '../src/config.js';
import { formatKst } from '../src/time.js';

const DAY = 86_400_000;
const { dbPath } = loadConfig();
const outDir = process.env.QNA_REPORTS_DIR ?? './reports';

let db;
try {
  db = new DatabaseSync(dbPath, { readOnly: true });
  const questions = db.prepare('SELECT id, program_id, title, created_at FROM questions ORDER BY id ASC').all();
  const answers = db.prepare('SELECT question_id FROM answers').all();
  const answered = new Set(answers.map((a) => a.question_id));
  const now = Date.now();
  const kstDate = formatKst(now).slice(0, 10);

  const open = questions
    .filter((q) => !answered.has(q.id))
    .map((q) => ({ ...q, days: Math.floor((now - q.created_at) / DAY) }))
    .sort((a, b) => b.days - a.days || a.id - b.id);

  const lines = [
    `# 주간 점검 보고서 ${kstDate}`,
    '',
    `생성 시각: ${formatKst(now)} KST`,
    '',
    '## 요약',
    '',
    `- 질문: ${questions.length}건`,
    `- 답변: ${answers.length}건`,
    `- 답변 없는 질문: ${open.length}건`,
    '',
    '## 답변 없는 질문 (경과 일수 큰 순)',
    '',
  ];
  if (open.length === 0) {
    lines.push('없음', '');
  } else {
    lines.push('| 질문 | 프로그램 ID | 등록일 | 경과 일수 | 제목 |', '| --- | --- | --- | --- | --- |');
    for (const q of open) {
      const title = q.title.replace(/[\r\n|]+/g, ' ');
      lines.push(`| ${q.id} | ${q.program_id} | ${formatKst(q.created_at).slice(0, 10)} | ${q.days} | ${title} |`);
    }
    lines.push('');
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `digest-${kstDate}.md`), lines.join('\n'), 'utf8');
  console.log(`보고서를 만들었습니다. 질문 ${questions.length}건, 답변 ${answers.length}건, 답변 없는 질문 ${open.length}건`);
} catch {
  console.error('주간 점검 보고서를 만들지 못했습니다.');
  process.exitCode = 1;
} finally {
  try { db?.close(); } catch {}
}
