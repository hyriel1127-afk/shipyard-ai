// QNA_DB가 없고 기본 DB(./data/qna.sqlite)도 없으면 데모 DB(./data/demo.sqlite)를 쓴다.
// 환경변수를 줄 수 없는 digest-notifier 에이전트가 실패하지 않도록 하는 보정이다.
import fs from 'node:fs';

if (!process.env.QNA_DB && !fs.existsSync('./data/qna.sqlite') && fs.existsSync('./data/demo.sqlite')) {
  process.env.QNA_DB = './data/demo.sqlite';
}
