// 게시판의 질문·답변을 data/snapshot/qna.md 한 파일로 내보낸다(조회만 함). 사용: npm run snapshot
// 입력 DB: DATABASE_URL(Neon), 출력 파일: QNA_SNAPSHOT_PATH (기본 ./data/snapshot/qna.md)
// 오류 문구는 고정 문구만 쓴다(경로·원본 오류·본문·개인정보를 출력하지 않는다).
import '../src/env.js';
import { loadConfig } from '../src/config.js';
import { connectNeon } from '../src/db.js';
import { exportSnapshot } from '../src/snapshot.js';

const MESSAGES = {
  DB_READ: '게시판 DB를 읽을 수 없습니다.',
  WRITE: '스냅샷 파일을 쓸 수 없습니다.',
};

const { databaseUrl, snapshotPath } = loadConfig();
let db;
try {
  try {
    db = connectNeon(databaseUrl);
  } catch {
    throw Object.assign(new Error('connect'), { code: 'DB_READ' });
  }
  const r = await exportSnapshot({ db, outPath: snapshotPath });
  console.log(
    r.questions === 0
      ? '스냅샷을 만들었습니다. 내보낼 질문이 없습니다'
      : `스냅샷을 만들었습니다. 질문 ${r.questions}건, 답변 ${r.answers}건`,
  );
} catch (e) {
  console.error(MESSAGES[e?.code] ?? '스냅샷을 만들지 못했습니다.');
  process.exitCode = 1;
} finally {
  try { await db?.close(); } catch {}
}
