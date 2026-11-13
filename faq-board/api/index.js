// Vercel 서버리스 함수 진입점. vercel.json 의 rewrites 로 모든 경로가 이 함수로 들어온다.
// DB 는 환경변수 DATABASE_URL(Neon)로 연결하며, 마이그레이션은 여기서 실행하지 않는다(npm run migrate).
import { loadConfig } from '../src/config.js';
import { connectNeon } from '../src/db.js';
import { createPrograms } from '../src/programs.js';
import { createHandler } from '../src/server.js';

let handler; // 같은 인스턴스가 재사용되는 동안 연결과 처리기를 다시 만들지 않는다.

export default async function main(req, res) {
  if (!handler) {
    const cfg = loadConfig();
    handler = createHandler({ db: connectNeon(cfg.databaseUrl), cfg, programs: createPrograms(cfg.programsPath) });
  }
  return handler(req, res);
}
