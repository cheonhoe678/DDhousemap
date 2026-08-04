import * as cheerio from 'cheerio';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HUG_LIST = 'https://www.khug.or.kr/jeonse/web/s07/s070102.jsp';
const KB_API = 'https://api.kbland.kr/land-property-suggestion/hugRelRntHouse/getAreaList';
const clean = (value = '') => value.replace(/\s+/g, ' ').trim();

async function fetchText(url, options = {}) {
  const { encoding = 'utf-8', ...fetchOptions } = options;
  const response = await fetch(url, {
    ...fetchOptions,
    signal: AbortSignal.timeout(60_000),
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; HUG-Jeonse-Map/1.0)',
      ...fetchOptions.headers,
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return new TextDecoder(encoding).decode(await response.arrayBuffer());
}

async function getHugPage(page) {
  const params = new URLSearchParams({
    BJAMT: 'ALL', sbGugun: 'ALL', view_Count: 'Y', BJAREA: 'ALL',
    BJORDER: 'ALL', CMB_SIDO: 'ALL', cur_page: String(page),
  });
  // HUG 응답 헤더에는 인코딩이 생략되어 있지만 실제 본문은 CP949 계열이다.
  const html = await fetchText(`${HUG_LIST}?${params}`, { encoding: 'euc-kr' });
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
  for (const bounds of tileBounds()) {
    const body = {
      selectCode: '1,2,3', zoomLevel: '13', ...bounds,
      '물건종류': '01,02,05,41', webCheck: 'Y',
    };
    const raw = await fetchText(KB_API, {
      method: 'POST',
      headers: {
        'content-type': 'application/json;charset=UTF-8',
        origin: 'https://kbland.kr',
        referer: 'https://kbland.kr/',
        webservice: '1',
      },
      body: JSON.stringify(body),
    });
    const payload = JSON.parse(raw);
    const groups = payload?.dataBody?.data?.['매물목록'] || [];
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
  return coordinateById;
}

export async function refreshData() {
  const first = await getHugPage(1);
  if (!first.total) throw new Error('HUG에서 현재 공고 주택을 찾지 못했습니다.');
  const pageCount = Math.ceil(first.total / 10);
  const pages = [first];
  for (let page = 2; page <= pageCount; page += 1) pages.push(await getHugPage(page));
  const listings = pages.flatMap((page) => page.rows);
  const coordinates = await getKbCoordinates();
  const merged = listings.map((listing) => ({ ...listing, ...(coordinates.get(listing.id) || {}) }));
  const located = merged.filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng)).length;
  const output = {
    meta: {
      fetchedAt: new Date().toISOString(),
      source: HUG_LIST,
      coordinateSource: 'https://kbland.kr/hug',
      noticeUrl: first.noticeUrl,
      total: merged.length,
      located,
    },
    listings: merged,
  };
  await mkdir(path.join(ROOT, 'public'), { recursive: true });
  await writeFile(path.join(ROOT, 'public', 'data.json'), JSON.stringify(output, null, 2), 'utf8');
  return output;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const data = await refreshData();
  console.log(`HUG ${data.meta.total}건 수집, 좌표 ${data.meta.located}건 연결 완료`);
}
