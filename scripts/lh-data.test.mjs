import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const data = JSON.parse(await readFile(new URL('../public/lh-data.json', import.meta.url), 'utf8'));
assert.equal(data.meta.total, 227);
assert.equal(data.listings.length, 227);
assert.equal(new Set(data.listings.map((item) => item.id)).size, 227);
assert.ok(data.listings.every((item) => item.provider === 'LH' && item.address && item.unit && item.depositWon > 0 && item.areaM2 > 0));
console.log('LH 데이터 검증 완료: 227호');
