import assert from 'node:assert/strict';
import { roundFor } from './refresh-data.mjs';

assert.equal(roundFor('20260724', [{ noticeDate: '20260724', round: 11 }]), 11);
assert.equal(roundFor('20260930', [{ noticeDate: '20260724', round: 11 }]), 12);
assert.equal(roundFor('20261030', [{ noticeDate: '20260930', round: 12 }]), 13);
console.log('회차 판별 확인 완료');
