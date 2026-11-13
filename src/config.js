export function loadConfig(env = process.env) {
  return {
    port: Number(env.QNA_PORT ?? 3000),
    host: env.QNA_HOST ?? '127.0.0.1',
    dbPath: env.QNA_DB ?? './data/qna.sqlite',
    snapshotPath: env.QNA_SNAPSHOT_PATH ?? './data/snapshot/qna.md',
    programsPath: env.QNA_PROGRAMS ?? './data/programs.json',
    readonly: env.QNA_READONLY === '1',
    devLogin: env.QNA_DEV_LOGIN === '1', // 테스트 전용: 비밀번호 없이 사번만으로 로그인
  };
}
