#!/usr/bin/env node
// 사내 QnA 게시판 MCP 서버. 외부 패키지 없이 stdio로 JSON-RPC를 한 줄씩 주고받는다.
// 게시판 주소는 환경 변수 QNA_API. 로그는 stderr로만 쓴다(stdout은 프로토콜 전용).
'use strict';

const readline = require('node:readline');

const SERVER_INFO = { name: 'qna-mcp', version: '0.1.0' };
const SUPPORTED_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const TIMEOUT_MS = 10000;

const TOOLS = [
  {
    name: 'search_questions',
    description:
      '사내 QnA 게시판에서 제목, 본문, 호선으로 질문을 검색한다. 채택된 질문이 먼저 나온다. ' +
      '검색어는 핵심 용어 1~3개로 짧게 넣는다(문장 전체를 넣지 않는다). ' +
      '결과는 요약이므로, 답하기 전에 get_question으로 원문을 읽는다.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '핵심 용어 1~3개 (예: "용접 변형")' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_question',
    description:
      '질문 번호로 질문 원문과 답변 목록을 가져온다. ' +
      '답하기 전에 반드시 이 도구로 원문을 읽고, 답변에는 질문 링크를 함께 적는다.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'integer', description: '질문 번호' },
      },
      required: ['id'],
    },
  },
];

function baseUrl() {
  const raw = (process.env.QNA_API || '').trim();
  if (!raw) throw new Error('환경 변수 QNA_API가 설정되지 않았습니다. 예: http://localhost:3000');
  return raw.replace(/\/+$/, '');
}

async function callApi(base, path) {
  const res = await fetch(base + path, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  let body;
  try {
    body = await res.json();
  } catch {
    throw new Error(`게시판이 JSON이 아닌 응답을 보냈습니다 (HTTP ${res.status})`);
  }
  if (!res.ok || (body && body.error)) {
    const e = body && body.error;
    const msg = e && typeof e === 'object' ? e.message || e.code || JSON.stringify(e) : e;
    throw new Error(`HTTP ${res.status}: ${msg || '알 수 없는 오류'}`);
  }
  return body ? body.data : body;
}

// 검색 결과 배열(또는 { items|results|questions: [...] })의 각 질문에 link를 붙인다.
function withLinks(data, base) {
  const add = (list) =>
    list.map((x) => (x && typeof x === 'object' && x.id !== undefined ? { link: `${base}/q/${x.id}`, ...x } : x));
  if (Array.isArray(data)) return add(data);
  if (data && typeof data === 'object') {
    const out = { ...data };
    for (const k of ['items', 'results', 'questions']) if (Array.isArray(out[k])) out[k] = add(out[k]);
    return out;
  }
  return data;
}

const handlers = {
  async search_questions(args) {
    const q = typeof args.query === 'string' ? args.query.trim() : '';
    if (!q) throw new Error('query는 비어 있을 수 없습니다.');
    const base = baseUrl();
    const data = await callApi(base, `/search?q=${encodeURIComponent(q)}`);
    return withLinks(data, base);
  },
  async get_question(args) {
    const id = Number(args.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error('id는 양의 정수여야 합니다.');
    const base = baseUrl();
    const data = await callApi(base, `/questions/${id}`);
    const q = data && data.question ? data.question : data;
    const link = `${base}/q/${q && q.id !== undefined ? q.id : id}`;
    return { link, ...(data && typeof data === 'object' ? data : { data }) };
  },
};

async function handleToolCall(params) {
  const name = params && params.name;
  const fn = handlers[name];
  if (!fn) return { isError: true, content: [{ type: 'text', text: `알 수 없는 도구: ${name}` }] };
  try {
    const result = await fn((params && params.arguments) || {});
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const timeout = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
    const msg = timeout ? `게시판 응답이 ${TIMEOUT_MS / 1000}초 안에 오지 않았습니다.` : err.message;
    return { isError: true, content: [{ type: 'text', text: msg }] };
  }
}

async function handleRequest(msg) {
  switch (msg.method) {
    case 'initialize': {
      const asked = msg.params && msg.params.protocolVersion;
      return {
        protocolVersion: SUPPORTED_VERSIONS.includes(asked) ? asked : SUPPORTED_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      };
    }
    case 'ping':
      return {};
    case 'tools/list':
      return { tools: TOOLS };
    case 'tools/call':
      return handleToolCall(msg.params);
    default: {
      const e = new Error(`Method not found: ${msg.method}`);
      e.code = -32601;
      throw e;
    }
  }
}

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
const pending = new Set();

rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    return;
  }
  const hasId = msg.id !== undefined && msg.id !== null;
  if (!hasId) return; // notifications/initialized 등은 응답하지 않는다.
  const p = handleRequest(msg)
    .then((result) => send({ jsonrpc: '2.0', id: msg.id, result }))
    .catch((err) =>
      send({ jsonrpc: '2.0', id: msg.id, error: { code: err.code || -32603, message: err.message } })
    )
    .finally(() => pending.delete(p));
  pending.add(p);
});

// stdin이 닫혀도 진행 중인 요청의 응답을 보낸 뒤 종료한다.
rl.on('close', () => Promise.allSettled([...pending]).then(() => process.exit(0)));
