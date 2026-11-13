// 테스트 서버 실행: 비밀번호 없는 로그인(QNA_DEV_LOGIN=1). 대상 DB 는 DATABASE_URL — 테스트용 Neon 브랜치를 쓸 것.
await import('../src/env.js');
if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
  console.error('운영 환경에서는 테스트 모드를 켤 수 없습니다.');
  process.exit(1);
}
process.env.QNA_DEV_LOGIN = '1';
const { createApp } = await import('../src/server.js');
const app = await createApp({ migrate: true });
console.log(`listening on ${app.url} (테스트 모드: 비밀번호 없이 사번만 입력)`);
