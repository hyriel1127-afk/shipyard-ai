// QnA 점검 보고서 MCP 서버 (stdio, 외부 패키지 없음). 도구: qna_review_report
// 답변 없는 질문과 오래된 답변(기본 365일 이상, KST)을 표준 마크다운 보고서로 돌려준다.
// 등록: 프로젝트 루트 .mcp.json. 작업 폴더는 항상 프로젝트 루트로 맞춘다.
// stdout은 JSON-RPC 전용이므로 로그는 stderr에 고정 문구만 쓴다(이름·사번·본문 금지).
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
await import('../src/env.js'); // 프로젝트 루트의 .env(DATABASE_URL)를 읽는다.
const { loadConfig } = await import('../src/config.js');
const { connectNeon } = await import('../src/db.js');
const { buildReviewReport, DEFAULT_STALE_DAYS } = await import('../src/review-report.js');

const SUPPORTED = ['2025-06-18', '2025-03-26', '2024-11-05'];
const TOOL = {
  name: 'qna_review_report',
  description:
    'QnA 게시판에서 답변이 없는 질문과, 답변이 달렸어도 마지막 답변 후 기준 일수(기본 365일, KST) 이상 지난 질문을 표준 점검 보고서(마크다운)로 만든다. DB는 조회만 하며 작성자 정보는 포함하지 않는다.',
  inputSchema: {
    type: 'object',
    properties: {
      stale_days: {
        type: 'integer',
        minimum: 1,
        default: DEFAULT_STALE_DAYS,
        description: '오래된 답변 기준 일수 (기본 365)',
      },
      save: {
        type: 'boolean',
        default: false,
        description: 'true이면 reports/review-YYYY-MM-DD.md 로도 저장한다 (기본 false)',
      },
    },
    additionalProperties: false,
  },
};

const send = (msg) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n');
const fail = (id, code, message) => send({ id, error: { code, message } });
const toolError = (id, text) => send({ id, result: { content: [{ type: 'text', text }], isError: true } });

async function callReport(id, args = {}) {
  const staleDays = args.stale_days ?? DEFAULT_STALE_DAYS;
  if (!Number.isInteger(staleDays) || staleDays < 1) return toolError(id, 'stale_days는 1 이상의 정수여야 합니다.');
  if (args.save !== undefined && typeof args.save !== 'boolean') return toolError(id, 'save는 true 또는 false여야 합니다.');

  let report;
  let db;
  try {
    db = connectNeon(loadConfig().databaseUrl);
    report = await buildReviewReport({ db, staleDays });
  } catch {
    return toolError(id, '게시판 DB를 읽을 수 없습니다.');
  } finally {
    try { await db?.close(); } catch {}
  }
  let text = report.markdown;
  if (args.save) {
    try {
      const dir = process.env.QNA_REPORTS_DIR ?? './reports';
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `review-${report.date}.md`);
      fs.writeFileSync(file, report.markdown, 'utf8');
      text += `\n---\n보고서를 저장했습니다: ${path.join(path.basename(dir), path.basename(file)).replaceAll('\\', '/')}\n`;
    } catch {
      return toolError(id, '보고서 파일을 쓸 수 없습니다.');
    }
  }
  send({ id, result: { content: [{ type: 'text', text }] } });
}

function handle(msg) {
  const { id, method, params } = msg;
  if (id === undefined) return; // 알림(notifications/*)은 응답하지 않는다.
  switch (method) {
    case 'initialize': {
      const v = params?.protocolVersion;
      return send({
        id,
        result: {
          protocolVersion: SUPPORTED.includes(v) ? v : SUPPORTED[0],
          capabilities: { tools: {} },
          serverInfo: { name: 'qna-report', version: '1.0.0' },
        },
      });
    }
    case 'ping':
      return send({ id, result: {} });
    case 'tools/list':
      return send({ id, result: { tools: [TOOL] } });
    case 'tools/call':
      if (params?.name !== TOOL.name) return fail(id, -32602, '알 수 없는 도구입니다.');
      return callReport(id, params.arguments).catch(() => toolError(id, '보고서를 만들지 못했습니다.'));
    default:
      return fail(id, -32601, '지원하지 않는 메서드입니다.');
  }
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return send({ id: null, error: { code: -32700, message: '요청을 해석할 수 없습니다.' } });
  }
  try {
    handle(msg);
  } catch {
    if (msg?.id !== undefined) fail(msg.id, -32603, '서버 내부 오류입니다.');
  }
});
