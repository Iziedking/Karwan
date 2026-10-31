import assert from 'node:assert/strict';
import test from 'node:test';
import type { Brief } from '../db/briefs.js';
import { requestsThatFit } from './fits.js';

const ADA = '0x00000000000000000000000000000000000000aa';
const brief = (jobId: string, sellers: string[], extra: Partial<Brief> = {}): Brief =>
  ({ jobId, briefText: 'Logo for a food business', postedBy: '0xbb', createdAt: 1, shortlist: sellers.map((sellerUser) => ({ sellerUser })), ...extra }) as unknown as Brief;

test('a seller sees the open requests whose shortlist names them', () => {
  const ids = requestsThatFit(ADA.toUpperCase().replace('0X', '0x'), [
    brief('0x1', [ADA]),
    brief('0x2', ['0x00000000000000000000000000000000000000cc']),
    brief('0x3', [ADA], { expiredAt: 5 }),
    brief('0x4', [ADA], { negotiationEndedAt: 5 }),
    brief('0x5', []),
  ]);
  assert.deepEqual(ids, ['0x1']);
});
