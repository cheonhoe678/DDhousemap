import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { coordinatesFor, searchLocal } from './refresh-chargers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_FILE = path.join(ROOT, 'public', 'lh-data.json');
const cleanAddress = (address) => address.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
const FALLBACK_COORDINATES = new Map([
  ['경기도 수원시 권선구 호매실로 29-9(고색동) 라움A동', { lat: 37.2553307, lng: 126.9707186 }],
  ['경기도 수원시 권선구 호매실로 29-9(고색동) 라움B동', { lat: 37.2553307, lng: 126.9707186 }],
  ['경기도 용인시 기흥구 동백죽전대로527번길 98-19(중동) 컨티넨탈 제이디하우스', { lat: 37.2823210577598, lng: 127.143188230283 }],
]);

export async function geocodeLh() {
  const clientId = process.env.NAVER_SEARCH_CLIENT_ID;
  const clientSecret = process.env.NAVER_SEARCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('NAVER_SEARCH_CLIENT_ID와 NAVER_SEARCH_CLIENT_SECRET을 설정해주세요.');

  const data = JSON.parse(await readFile(DATA_FILE, 'utf8'));
  const groups = Map.groupBy(data.listings, (item) => item.address);
  const entries = [...groups.values()];

  for (let index = 0; index < entries.length; index += 3) {
    await Promise.all(entries.slice(index, index + 3).map(async (listings) => {
      const item = listings[0];
      const addressBuilding = item.address.match(/,\s*([^)]+)\)?$/)?.[1] || item.address.match(/\)\s*(.+)$/)?.[1];
      const queries = [cleanAddress(item.address), item.address.split('(')[0].trim(), addressBuilding && `${item.city} ${item.district} ${addressBuilding}`, `${item.city} ${item.district} ${item.buildingName}`].filter(Boolean);
      let location = null;
      for (const query of queries) {
        const results = await searchLocal(query, clientId, clientSecret);
        location = results.map(coordinatesFor).find(Boolean);
        if (location) break;
      }
      listings.forEach((listing) => Object.assign(listing, location || FALLBACK_COORDINATES.get(listing.address) || { lat: null, lng: null }));
    }));
  }

  data.meta.geocodedAt = new Date().toISOString();
  data.meta.located = data.listings.filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng)).length;
  await writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  console.log(`LH 좌표 확인 완료: ${data.meta.located}/${data.meta.total}호`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await geocodeLh();
