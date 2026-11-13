// 게시판의 질문·답변을 data/snapshot/qna.md 한 파일로 내보낸다(읽기 전용). 사용: npm run snapshot
// 입력 DB: QNA_DB, 출력 파일: QNA_SNAPSHOT_PATH (기본 ./data/snapshot/qna.md)
// 오류 문구는 고정 문구만 쓴다(경로·원본 오류·본문·개인정보를 출력하지 않는다).
import { loadConfig } from '../src/config.js';
import { exportSnapshot } from '../src/snapshot.js';

const MESSAGES = {
  DB_READ: '게시판 DB를 읽을 수 없습니다.',
  WRITE: '스냅샷 파일을 쓸 수 없습니다.',
};

const { dbPath, snapshotPath } = loadConfig();
try {
  const r = exportSnapshot({ dbPath, outPath: snapshotPath });
  console.log(
    r.questions === 0
      ? '스냅샷을 만들었습니다. 내보낼 질문이 없습니다'
      : `스냅샷을 만들었습니다. 질문 ${r.questions}건, 답변 ${r.answers}건`,
  );
} catch (e) {
  console.error(MESSAGES[e?.code] ?? '스냅샷을 만들지 못했습니다.');
  process.exitCode = 1;
}
