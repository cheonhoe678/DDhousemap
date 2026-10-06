import assert from 'node:assert/strict';
import { applicationDeadline, roundFor } from './refresh-data.mjs';
import { distanceMeters, nearestCharger } from './refresh-chargers.mjs';

assert.equal(roundFor('20260724', [{ noticeDate: '20260724', round: 11 }]), 11);
assert.equal(roundFor('20260930', [{ noticeDate: '20260724', round: 11 }]), 12);
assert.equal(roundFor('20261030', [{ noticeDate: '20260930', round: 12 }]), 13);
assert.equal(applicationDeadline('2026.09.30. 10:00 ~ 2026.10.12. 17:00').toISOString(), '2026-10-12T08:00:00.000Z');
assert.ok(distanceMeters({ lat: 37.5, lng: 127 }, { lat: 37.5009, lng: 127 }) > 99);
assert.equal(nearestCharger({ lat: 37.5, lng: 127 }, [{ title: '<b>충전소</b>', mapx: 1270000000, mapy: 375009000 }]).name, '충전소');
console.log('회차 판별 확인 완료');
