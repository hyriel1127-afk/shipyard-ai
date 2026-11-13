export function loadConfig(env = process.env) {
  return {
    port: Number(env.QNA_PORT ?? 3000),
    host: env.QNA_HOST ?? '127.0.0.1',
    databaseUrl: env.DATABASE_URL, // Neon 연결 문자열(풀러 주소 권장). 로그·화면에 출력하지 않는다.
    snapshotPath: env.QNA_SNAPSHOT_PATH ?? './data/snapshot/qna.md',
    programsPath: env.QNA_PROGRAMS ?? './data/programs.json',
    readonly: env.QNA_READONLY === '1',
    devLogin: env.QNA_DEV_LOGIN === '1' && !env.VERCEL, // 테스트 전용: 비밀번호 없이 사번만으로 로그인. Vercel 에서는 켜지지 않는다.
    secureCookie: env.QNA_SECURE_COOKIE === '1' || !!env.VERCEL, // HTTPS(Vercel)에서는 세션 쿠키에 Secure 를 붙인다.
  };
}
