// 테스트용 계정·문의글 시드. 사용: node scripts/seed-test-data.js  (대상 DB: QNA_DB, 기본 ./data/test.sqlite)
// 실행할 때마다 대상 DB의 사용자·질문·답변·세션을 비우고 다시 만든다. 운영 DB에는 사용하지 말 것.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { openDb, migrate } from '../src/db.js';
import { hashPassword } from '../src/auth.js';

const dbPath = process.env.QNA_DB ?? './data/test.sqlite';
const programsPath = process.env.QNA_PROGRAMS ?? './data/programs.json';

const PROGRAMS = ['HRMS0001', 'ORDR0001', 'ACCT0001']; // 인사관리 / 주문관리 / 회계
const USERS = [
  ['A001', '김민수'], ['A002', '이서연'], ['A003', '박지훈'],
  ['B001', '최유진'], ['B002', '정현우'],
];
const ANSWERERS = ['B001', 'B002'];

const DAY = 24 * 60 * 60 * 1000;
// [프로그램, 작성자, 제목, 본문, 며칠 전, 답변(담당자, 내용)|null]
const QUESTIONS = [
  ['HRMS0001', 'A001', '연차 신청 화면에서 잔여 일수가 0으로 표시됩니다', '연차 신청 메뉴에 들어가면 잔여 연차가 0일로 나옵니다. 인사팀 확인 결과 실제로는 12일이 남아 있습니다. 어제부터 계속 같은 증상입니다.', 9,
    ['B001', '연차 집계 배치가 어제 오전 실패해 잔여 일수가 갱신되지 않았습니다. 재처리를 완료했으니 새로고침 후 다시 확인해 주세요.']],
  ['HRMS0001', 'A002', '재직증명서 출력 시 직인이 보이지 않습니다', '재직증명서를 PDF로 출력하면 하단 직인 이미지가 빠져 있습니다. 크롬과 엣지 모두 동일합니다.', 8,
    ['B002', '직인 이미지 경로가 변경되어 발생한 문제입니다. 오늘 오후 배포로 수정 예정이며, 그전에는 인사팀에서 직인본을 발급받아 주세요.']],
  ['HRMS0001', 'A003', '조직도 조회 속도가 너무 느립니다', '본부 단위로 조직도를 펼치면 로딩에 20초 이상 걸립니다. 오전 10시 전후에 특히 심합니다.', 6, null],
  ['HRMS0001', 'A001', '근태 수정 요청은 어디서 하나요?', '출퇴근 기록이 누락되어 수정하려는데 메뉴를 찾지 못했습니다. 근태 > 정정 신청 메뉴가 안 보입니다.', 3,
    ['B001', '정정 신청은 근태 > 내 근태 조회에서 해당 일자를 선택한 뒤 [정정 요청] 버튼으로 진행합니다. 팀장 승인 후 반영됩니다.']],
  ['ORDR0001', 'A002', '주문 등록 시 "거래처 코드 오류" 메시지가 발생합니다', '신규 거래처 C-20931로 주문을 등록하면 거래처 코드 오류가 나옵니다. 거래처 마스터에는 등록되어 있습니다.', 7,
    ['B002', '거래처 마스터 등록 후 주문 시스템 동기화가 하루 지연됩니다. 오늘 오전 동기화가 끝났으니 다시 시도해 보시고, 계속되면 코드를 알려 주세요.']],
  ['ORDR0001', 'A003', '주문 내역 엑셀 다운로드가 1,000건에서 잘립니다', '기간을 한 달로 조회해 엑셀로 내려받으면 1,000건까지만 포함됩니다. 전체 건수는 3,400건입니다.', 5, null],
  ['ORDR0001', 'A001', '배송지 변경이 출고 지시 후에도 가능한가요?', '출고 지시가 난 주문의 배송지를 바꿔야 하는 상황입니다. 시스템에서 수정 버튼이 비활성화되어 있습니다. 가능한 방법이 있을까요?', 2,
    ['B001', '출고 지시 이후에는 시스템에서 변경할 수 없습니다. 물류팀에 출고 취소를 요청한 뒤 주문을 재등록해 주세요.']],
  ['ACCT0001', 'A002', '법인카드 정산 시 영수증 첨부 용량 제한이 있나요?', '영수증 사진을 올리면 "파일 크기 초과"가 뜹니다. 한도가 얼마인지, 여러 장은 어떻게 올리는지 알고 싶습니다.', 4, null],
  ['ACCT0001', 'A003', '전표 승인 후 금액 수정이 필요합니다', '어제 승인된 전표의 금액이 잘못 입력되었습니다. 반려나 수정 방법을 알려 주세요.', 1, null],
  ['ACCT0001', 'A001', '월말 결산 마감 일정은 어디서 확인하나요?', '이번 달 결산 마감일을 확인하고 싶은데 공지 메뉴에서 찾지 못했습니다.', 0,
    ['B002', '결산 마감 일정은 회계 > 결산관리 > 마감 캘린더에서 확인할 수 있습니다. 이번 달 마감은 말일 18시입니다.']],
];

fs.writeFileSync(programsPath, JSON.stringify(PROGRAMS) + '\n');

const db = openDb(dbPath);
migrate(db, 'up');
for (const t of ['sessions', 'answers', 'questions', 'answerers', 'users']) db.exec(`DELETE FROM ${t}`);

const userId = {};
const insUser = db.prepare('INSERT INTO users(emp_no, name, password_hash) VALUES (?, ?, ?)');
for (const [empNo, name] of USERS) {
  // 테스트 로그인은 비밀번호를 받지 않는다(QNA_DEV_LOGIN=1). 해시는 추측 불가능한 임의 값.
  userId[empNo] = Number(insUser.run(empNo, name, hashPassword(crypto.randomUUID())).lastInsertRowid);
}
for (const e of ANSWERERS) db.prepare('INSERT INTO answerers(emp_no) VALUES (?)').run(e);

const now = Date.now();
const insQ = db.prepare('INSERT INTO questions(program_id, title, body, author_id, created_at, form_token) VALUES (?, ?, ?, ?, ?, ?)');
const insA = db.prepare('INSERT INTO answers(question_id, body, author_id, created_at, form_token) VALUES (?, ?, ?, ?, ?)');
// 오래된 글부터 넣어 id 가 시간순이 되게 한다.
for (const [prog, author, title, body, daysAgo, ans] of [...QUESTIONS].sort((a, b) => b[4] - a[4])) {
  const created = now - daysAgo * DAY - Math.floor(Math.random() * 4 * 60 * 60 * 1000);
  const qid = Number(insQ.run(prog, title, body, userId[author], created, crypto.randomUUID()).lastInsertRowid);
  if (ans) insA.run(qid, ans[1], userId[ans[0]], created + 2 * 60 * 60 * 1000, crypto.randomUUID());
}
db.close();
console.log(`시드 완료: DB=${dbPath}, 사용자 ${USERS.length}명, 프로그램 ${PROGRAMS.length}개, 질문 ${QUESTIONS.length}건`);
