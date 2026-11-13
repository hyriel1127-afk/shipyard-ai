import fs from 'node:fs';
import { event } from './logger.js';

// data/programs.json(문자열 배열)이 유효 프로그램 ID 의 유일한 원천.
// 파일이 바뀌면(mtime/size) 다시 읽고, 깨지면 마지막 정상 목록을 유지한다.
export function createPrograms(file) {
  let set = null;
  let list = [];
  let key = null;

  function refresh() {
    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      if (key !== 'missing') {
        key = 'missing';
        event({ event: 'programs.load_failed', result: 'error' });
      }
      return;
    }
    const k = `${stat.mtimeMs}:${stat.size}`;
    if (k === key) return;
    key = k;
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!Array.isArray(data) || !data.every((x) => typeof x === 'string')) throw new Error('bad shape');
      list = data;
      set = new Set(data);
    } catch {
      event({ event: 'programs.load_failed', result: 'error' });
    }
  }

  refresh();
  return {
    has(id) {
      refresh();
      return set !== null && typeof id === 'string' && set.has(id);
    },
    list() {
      refresh();
      return [...list];
    },
    state() {
      refresh();
      return set === null ? 'unavailable' : 'ok';
    },
  };
}
