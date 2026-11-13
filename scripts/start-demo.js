// 테스트 서버 실행: 시드 DB(data/test.sqlite) + 비밀번호 없는 로그인
process.env.QNA_DB ??= './data/test.sqlite';
process.env.QNA_DEV_LOGIN = '1';
await import('../src/server.js').then(async (m) => {
  const app = await m.createApp();
  console.log(`listening on ${app.url} (테스트 모드: 비밀번호 없이 사번만 입력)`);
});
