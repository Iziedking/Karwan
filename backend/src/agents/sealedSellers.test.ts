import assert from 'node:assert/strict';
import test from 'node:test';
import { sealedSellers, type SealedSellerDeps } from './sealedSellers.js';

/// The seller block on every offer, fixed price or hourly (view 32): the buyer's
/// agent ranks sellers by fit and record, and the rows leave sealed.

const BUYER = '0x00000000000000000000000000000000000000b1';
const ADA = { sellerUser: '0x00000000000000000000000000000000000000a1', sellerAgent: '0x00000000000000000000000000000000000000a2' };
const TUNDE = { sellerUser: '0x00000000000000000000000000000000000000c1', sellerAgent: '0x00000000000000000000000000000000000000c2' };

const counts = { completed: 23, onTimeRate: 96, disputesWon: 0, disputesLost: 0, cancelled: 0 };

function deps(over: Partial<SealedSellerDeps> = {}): SealedSellerDeps {
  return {
    readRecord: async () => null,
    level: async (u) => (u === ADA.sellerUser ? 'id_verified' : 'registered'),
    engine: async (u) => ({ score: u === ADA.sellerUser ? 700 : 300, tier: u === ADA.sellerUser ? 'ESTABLISHED' : 'NEW', counts }),
    profile: async (u) => ({ name: u === ADA.sellerUser ? 'Ada Obi' : 'Tunde', tag: u === ADA.sellerUser ? 'ada' : null }),
    location: async () => null,
    rating: async (u) => (u === ADA.sellerUser ? { kind: 'rated', value: 4.8, count: 23, disputed: 0 } : { kind: 'new', count: 0 }),
    timeoutMs: 1_000,
    sellerWords: async (u) => (u === ADA.sellerUser ? ['logo', 'brand', 'design'] : ['plumbing']),
    cleanRecordCounts: false,
    ...over,
  };
}

const offer = (who: typeof ADA, priceUsdc: string) => ({ ...who, priceUsdc, deadlineUnix: 1_900_000_000, note: '' });

test('every offer gets a sealed block, the best fit first, and never a score or a count', async () => {
  const rows = await sealedSellers(
    { requestId: 'job_1', buyer: BUYER, budgetUsdc: '100', keywords: ['logo', 'design'], offers: [offer(TUNDE, '60'), offer(ADA, '90')] },
    deps(),
    Date.UTC(2026, 9, 30),
  );
  assert.deepEqual(rows.map((r) => r.sellerAgent), [ADA.sellerAgent, TUNDE.sellerAgent]);
  const ada = rows[0]!;
  assert.equal(ada.name, 'Ada Obi');
  assert.equal(ada.tag, 'ada');
  assert.equal(ada.verified, true);
  assert.equal(ada.tier, 'ESTABLISHED');
  assert.deepEqual(ada.rating, { kind: 'rated', value: 4.8, count: 23, disputed: 0 });
  assert.equal(ada.recommended, true);
  assert.ok(ada.reasons.length <= 3);
  for (const r of rows) {
    assert.ok(!('score' in r) && !('counts' in r), 'no score or counts leave');
  }
});

test('more offers than the shortlist holds still all get a block', async () => {
  const many = Array.from({ length: 8 }, (_, i) => ({
    sellerUser: `0x${(0xd0 + i).toString(16).padStart(40, '0')}`,
    sellerAgent: `0x${(0xe0 + i).toString(16).padStart(40, '0')}`,
    priceUsdc: '50',
    deadlineUnix: 1_900_000_000,
    note: '',
  }));
  const rows = await sealedSellers({ requestId: 'job_2', buyer: BUYER, budgetUsdc: '100', keywords: [], offers: many }, deps(), Date.UTC(2026, 9, 30));
  assert.equal(rows.length, 8);
  assert.equal(new Set(rows.map((r) => r.sellerAgent)).size, 8);
  assert.ok(rows.filter((r) => r.recommended).length <= 1);
});

test('no offers, no reads', async () => {
  let reads = 0;
  const rows = await sealedSellers({ requestId: 'job_3', buyer: BUYER, budgetUsdc: '100', keywords: [], offers: [] }, deps({ engine: async () => { reads++; return { score: 0, tier: 'NEW', counts }; } }), 0);
  assert.deepEqual(rows, []);
  assert.equal(reads, 0);
});
