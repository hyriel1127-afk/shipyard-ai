// 로컬 개발용: 프로젝트 루트의 .env 가 있으면 환경변수로 읽는다(Node 내장 기능, 외부 패키지 없음).
// 이미 설정된 환경변수는 덮어쓰지 않는다. Vercel 에서는 대시보드의 환경변수를 쓰므로 .env 가 없어도 된다.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  process.loadEnvFile(path.join(root, '.env'));
} catch {
  // .env 가 없으면 그대로 진행한다.
}
