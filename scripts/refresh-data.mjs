import * as cheerio from 'cheerio';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HUG_LIST = 'https://www.khug.or.kr/jeonse/web/s07/s070102.jsp';
const KB_API = 'https://api.kbland.kr/land-property-suggestion/hugRelRntHouse/getAreaList';
const DATA_FILE = path.join(ROOT, 'public', 'data.json');
const clean = (value = '') => value.replace(/\s+/g, ' ').trim();

export function roundFor(noticeDate, listings) {
  const sameNotice = listings.find((item) => item.noticeDate === noticeDate && item.round);
  if (sameNotice) return sameNotice.round;
  return Math.max(11, ...listings.map((item) => Number(item.round) || 11)) + 1;
}

async function fetchText(url, options = {}) {
  const { encoding = 'utf-8', timeout = 60_000, retries = 2, ...fetchOptions } = options;
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: AbortSignal.timeout(timeout),
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; HUG-Jeonse-Map/1.0)',
          ...fetchOptions.headers,
        },
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
      return new TextDecoder(encoding).decode(await response.arrayBuffer());
    } catch (error) {
      if (attempt >= retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
}

async function getHugPage(page, fetchOptions = {}) {
  const params = new URLSearchParams({
    BJAMT: 'ALL', sbGugun: 'ALL', view_Count: 'Y', BJAREA: 'ALL',
    BJORDER: 'ALL', CMB_SIDO: 'ALL', cur_page: String(page),
  });
  // HUG 응답 헤더에는 인코딩이 생략되어 있지만 실제 본문은 CP949 계열이다.
  const html = await fetchText(`${HUG_LIST}?${params}`, { encoding: 'euc-kr', ...fetchOptions });
  const $ = cheerio.load(html);
  const totalText = clean($('.pageNum .total').text());
  const total = Number(totalText.match(/\d+/)?.[0] || 0);
  const noticeUrl = $('#btn_downdoc a').attr('href') || null;
  const rows = [];

  $('table.d_list tbody tr').each((_, row) => {
    const cells = $(row).find('td').map((__, td) => clean($(td).text())).get();
    if (cells.length < 11) return;
    const href = $(row).find('td').eq(5).find('a').attr('href') || '';
    const detail = new URL(href, HUG_LIST);
    const areaM2 = Number(cells[8]);
    const depositWon = Number(cells[9].replace(/,/g, ''));
    rows.push({
      rowNumber: Number(cells[0]),
      noticeDate: cells[1],
      applicationPeriod: cells[2],
      city: cells[3],
      district: cells[4].replace(/^(서울|부산|인천|경기)\s+/, ''),
      address: cells[5],
      housingType: cells[6],
      purchaseType: cells[7],
      areaM2,
      areaPyeong: Math.round((areaM2 / 3.305785) * 10) / 10,
      depositWon,
      applicants: Number(cells[10].replace(/,/g, '')) || 0,
      id: detail.searchParams.get('no'),
      detailUrl: detail.href,
    });
  });
  return { total, noticeUrl, rows };
}

export async function getCurrentNotice({ allowPartial = false, requestedPages = null } = {}) {
  const first = await getHugPage(1);
  if (!first.total) throw new Error('HUG에서 현재 공고 주택을 찾지 못했습니다.');
  const pageCount = Math.ceil(first.total / 10);
  console.log(`HUG 최신 공고 ${first.total}건(${pageCount}페이지) 확인`);
  const pages = [first];
  const targets = requestedPages
    ? [...new Set(requestedPages)].filter((page) => page > 1 && page <= pageCount)
    : Array.from({ length: pageCount - 1 }, (_, index) => index + 2);
  for (let index = 0; index < targets.length; index += 5) {
    const batch = await Promise.all(targets.slice(index, index + 5).map((page) =>
      getHugPage(page).catch((error) => {
        if (!allowPartial) throw error;
        console.warn(`${page}페이지 확인 실패, 기존 지원자 수 유지: ${error.message}`);
        return null;
      })));
    pages.push(...batch.filter(Boolean));
  }
  return { first, listings: pages.flatMap((page) => page.rows), fetchedPages: pages.length, pageCount };
}

export function applicationDeadline(period) {
  const match = period?.match(/~\s*(\d{4})\.(\d{2})\.(\d{2})\.\s*(\d{2}):(\d{2})/);
  return match ? new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:00+09:00`) : null;
}

function tileBounds() {
  const regions = [
    { south: 36.75, north: 38.25, west: 126.15, east: 127.95 },
    { south: 34.85, north: 35.55, west: 128.65, east: 129.45 },
  ];
  const tiles = [];
  for (const region of regions) {
    for (let south = region.south; south < region.north; south += 0.28) {
      for (let west = region.west; west < region.east; west += 0.5) {
        tiles.push({
          startLat: south.toFixed(6),
          startLng: west.toFixed(6),
          endLat: Math.min(south + 0.28, region.north).toFixed(6),
          endLng: Math.min(west + 0.5, region.east).toFixed(6),
        });
      }
    }
  }
  return tiles;
}

async function getKbCoordinates() {
  const coordinateById = new Map();
  const loadTile = async (bounds) => {
    const body = {
      selectCode: '1,2,3', zoomLevel: '13', ...bounds,
      '물건종류': '01,02,05,41', webCheck: 'Y',
    };
    const raw = await fetchText(KB_API, {
      method: 'POST',
      timeout: 12_000,
      headers: {
        'content-type': 'application/json;charset=UTF-8',
        origin: 'https://kbland.kr',
        referer: 'https://kbland.kr/',
        webservice: '1',
      },
      body: JSON.stringify(body),
    });
    const payload = JSON.parse(raw);
    return payload?.dataBody?.data?.['매물목록'] || [];
  };
  const tiles = tileBounds();
  for (let index = 0; index < tiles.length; index += 6) {
    const tileGroups = await Promise.all(tiles.slice(index, index + 6).map(async (bounds) => {
      try { return await loadTile(bounds); }
      catch (error) {
        console.warn(`좌표 구역 조회 건너뜀 (${bounds.startLat}, ${bounds.startLng}): ${error.message}`);
        return [];
      }
    }));
    for (const groups of tileGroups) {
    for (const group of groups) {
      const ids = String(group['상세링크내용'] || '').split('|');
      const names = String(group['건물명'] || '').split('|');
      const units = String(group['호수'] || '').split('|');
      ids.forEach((id, index) => coordinateById.set(id, {
        lat: Number(group['wgs84위도']),
        lng: Number(group['wgs84경도']),
        buildingName: clean(names[index] || names[0] || ''),
        unit: clean(units[index] || ''),
      }));
    }
    }
  }
  return coordinateById;
}

export async function refreshData() {
  const previous = JSON.parse(await readFile(DATA_FILE, 'utf8').catch(() => '{"listings":[]}'));
  const previousListings = (previous.listings || []).map((item) => ({ ...item, round: Number(item.round) || 11 }));
  const { first, listings } = await getCurrentNotice();
  const round = roundFor(listings[0]?.noticeDate, previousListings);
  const coordinates = await getKbCoordinates();
  const oldCoordinates = new Map(previousListings.map((item) => [item.id, {
    lat: item.lat, lng: item.lng, buildingName: item.buildingName, unit: item.unit,
  }]));
  const current = listings.map((listing) => ({
    ...listing,
    round,
    ...(oldCoordinates.get(listing.id) || {}),
    ...(coordinates.get(listing.id) || {}),
  }));
  const merged = [...previousListings.filter((item) => item.round !== round), ...current];
  const located = merged.filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng)).length;
  const rounds = [...new Set(merged.map((item) => item.round))].sort((a, b) => b - a);
  const output = {
    meta: {
      fetchedAt: new Date().toISOString(),
      source: HUG_LIST,
      coordinateSource: 'https://kbland.kr/hug',
      noticeUrl: first.noticeUrl,
      total: merged.length,
      located,
      rounds,
    },
    listings: merged,
  };
  await mkdir(path.join(ROOT, 'public'), { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(output, null, 2), 'utf8');
  return output;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const data = await refreshData();
  console.log(`HUG ${data.meta.rounds.join('·')}차 총 ${data.meta.total}건, 좌표 ${data.meta.located}건 연결 완료`);
}
