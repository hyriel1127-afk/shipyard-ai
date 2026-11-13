const fmt = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// 화면에 표시하는 모든 시각은 이 함수만 거친다. UTC epoch ms → 'YYYY-MM-DD HH:mm' (KST)
export function formatKst(epochMs) {
  const p = {};
  for (const { type, value } of fmt.formatToParts(new Date(epochMs))) p[type] = value;
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}
