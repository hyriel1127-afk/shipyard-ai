export function loadConfig(env = process.env) {
  return {
    port: Number(env.QNA_PORT ?? 3000),
    host: env.QNA_HOST ?? '127.0.0.1',
    dbPath: env.QNA_DB ?? './data/qna.sqlite',
    programsPath: env.QNA_PROGRAMS ?? './data/programs.json',
    readonly: env.QNA_READONLY === '1',
  };
}
