import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { applicationDeadline, getCurrentNotice } from './refresh-data.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_FILE = path.join(ROOT, 'public', 'data.json');
const data = JSON.parse(await readFile(DATA_FILE, 'utf8'));
const latestRound = Math.max(...data.listings.map((item) => Number(item.round) || 11));
const savedLatest = data.listings.filter((item) => item.round === latestRound);
const deadline = applicationDeadline(savedLatest[0]?.applicationPeriod);

if (!deadline) throw new Error('최신 모집의 마감 시각을 확인하지 못했습니다.');
if (Date.now() > deadline.getTime()) {
  console.log(`${latestRound}차 모집이 마감되어 지원자 수 갱신을 건너뜁니다.`);
  process.exit(0);
}

const { first, listings, fetchedPages, pageCount } = await getCurrentNotice({ allowPartial: true });
if (listings[0]?.noticeDate !== savedLatest[0]?.noticeDate) {
  throw new Error('새 모집 차수가 발견됐습니다. npm run refresh로 전체 데이터를 먼저 갱신해주세요.');
}

const applicantById = new Map(listings.map((item) => [item.id, item.applicants]));
if (applicantById.size < savedLatest.length * 0.8) {
  throw new Error(`지원자 수 확인 범위가 너무 작습니다: ${applicantById.size}/${savedLatest.length}`);
}
let changed = 0;
for (const item of savedLatest) {
  const applicants = applicantById.get(item.id);
  if (applicants === undefined || applicants === item.applicants) continue;
  item.applicants = applicants;
  changed += 1;
}

const checkedAt = new Date().toISOString();
data.meta.fetchedAt = checkedAt;
data.meta.applicantsFetchedAt = checkedAt;
data.meta.applicantsChecked = applicantById.size;
data.meta.noticeUrl = first.noticeUrl;
await writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
console.log(`${latestRound}차 지원자 수 확인 완료: ${changed}호 변경, ${applicantById.size}/${savedLatest.length}호 확인 (${fetchedPages}/${pageCount}페이지)`);
