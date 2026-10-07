import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_FILE = path.join(ROOT, 'public', 'data.json');
const SEARCH_API = 'https://openapi.naver.com/v1/search/local.json';
const RADIUS_M = 300;
const clean = (value = '') => value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

export function distanceMeters(from, to) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const dLat = radians(to.lat - from.lat);
  const dLng = radians(to.lng - from.lng);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function nearestCharger(listing, items, radiusM = RADIUS_M) {
  return items.map((item) => {
    const lat = Number(item.mapy) / 10_000_000;
    const lng = Number(item.mapx) / 10_000_000;
    return {
      name: clean(item.title),
      address: clean(item.roadAddress || item.address),
      lat,
      lng,
      distanceM: Math.round(distanceMeters(listing, { lat, lng })),
      mapUrl: `https://map.naver.com/p/search/${encodeURIComponent(clean(item.title))}`,
    };
  }).filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng) && item.distanceM <= radiusM)
    .sort((a, b) => a.distanceM - b.distanceM)[0] || null;
}

function searchQuery(item) {
  const place = item.buildingName || item.address.replace(/\s+제?\S*층.*$/, '');
  return `${item.city} ${item.district} ${place} 전기차 충전소`;
}

async function searchLocal(query, clientId, clientSecret) {
  const url = new URL(SEARCH_API);
  url.searchParams.set('query', query);
  url.searchParams.set('display', '5');
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(20_000),
      headers: { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret },
    }).catch((error) => ({ ok: false, status: 0, statusText: error.message }));
    if (response.ok) return (await response.json()).items || [];
    if (attempt >= 2 || response.status === 401 || response.status === 403) {
      const detail = typeof response.text === 'function' ? clean(await response.text()) : '';
      throw new Error(`네이버 지역 검색 실패 (${response.status} ${response.statusText})${detail ? `: ${detail}` : ''}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
}

export async function refreshChargers() {
  const clientId = process.env.NAVER_SEARCH_CLIENT_ID;
  const clientSecret = process.env.NAVER_SEARCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('NAVER_SEARCH_CLIENT_ID와 NAVER_SEARCH_CLIENT_SECRET을 설정해주세요.');

  const data = JSON.parse(await readFile(DATA_FILE, 'utf8'));
  const groups = new Map();
  for (const item of data.listings) {
    if (!Number.isFinite(item.lat) || !Number.isFinite(item.lng)) continue;
    const key = `${item.lat.toFixed(5)},${item.lng.toFixed(5)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  const entries = [...groups.values()];
  let matched = 0;
  for (let index = 0; index < entries.length; index += 3) {
    await Promise.all(entries.slice(index, index + 3).map(async (listings) => {
      const representative = listings[0];
      const results = await searchLocal(searchQuery(representative), clientId, clientSecret);
      const charger = nearestCharger(representative, results);
      if (charger) matched += 1;
      listings.forEach((item) => { item.evCharger = charger; });
    }));
  }

  data.meta.evCheckedAt = new Date().toISOString();
  data.meta.evRadiusM = RADIUS_M;
  data.meta.evBuildings = entries.length;
  data.meta.evMatches = matched;
  await writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  console.log(`전기차 충전소 확인 완료: ${matched}/${entries.length}개 건물 (${RADIUS_M}m 이내)`);
  return data;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await refreshChargers();
