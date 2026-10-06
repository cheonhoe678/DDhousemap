import assert from 'node:assert/strict';
import { applicationDeadline, roundFor } from './refresh-data.mjs';

assert.equal(roundFor('20260724', [{ noticeDate: '20260724', round: 11 }]), 11);
assert.equal(roundFor('20260930', [{ noticeDate: '20260724', round: 11 }]), 12);
assert.equal(roundFor('20261030', [{ noticeDate: '20260930', round: 12 }]), 13);
assert.equal(applicationDeadline('2026.09.30. 10:00 ~ 2026.10.12. 17:00').toISOString(), '2026-10-12T08:00:00.000Z');
console.log('회차 판별 확인 완료');
