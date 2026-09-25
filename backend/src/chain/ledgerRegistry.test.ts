import assert from 'node:assert/strict';
import test from 'node:test';
import { findDeployBlock, mergeLedger, retirement, type LedgerEntry } from './ledgerRegistry.js';

type Hex = `0x${string}`;
const A = '0x00000000000000000000000000000000000000aa' as Hex;
const B = '0x00000000000000000000000000000000000000bb' as Hex;
const C = '0x00000000000000000000000000000000000000cc' as Hex;

test('the deploy block is the first block with code, found by binary search', async () => {
  const deployedAt = 1_234_567n;
  let calls = 0;
  const block = await findDeployBlock(A, 5_000_000n, async (_addr, at) => {
    calls += 1;
    return at >= deployedAt;
  });
  assert.equal(block, deployedAt);
  assert.ok(calls <= 25, `binary search, not a scan (${calls} reads)`);
});

test('a contract with no code at head is not deployed on this network', async () => {
  assert.equal(await findDeployBlock(A, 100n, async () => false), null);
});

test('discovered contracts are added once and keep their first deploy block', () => {
  const statics: LedgerEntry[] = [{ name: 'KarwanEscrow', kind: 'settlement', address: A, deployBlock: 10n, source: 'static' }];
  const discovered: LedgerEntry[] = [{ name: 'KarwanDealEscrow', kind: 'settlement', address: B, deployBlock: 50n, source: 'discovered' }];
  const merged = mergeLedger(statics, discovered);
  assert.deepEqual(merged.map((e) => e.address), [A, B]);
  // an address in both lists is the static one; addresses compare case-insensitively
  const again = mergeLedger(statics, [...discovered, { ...statics[0]!, address: A.toUpperCase() as Hex, source: 'discovered' }]);
  assert.equal(again.length, 2);
});

test('whatever is in the ledger but not configured now is retired; each name keeps its lineage', () => {
  const ledger: LedgerEntry[] = [
    { name: 'KarwanEscrow', kind: 'settlement', address: A, deployBlock: 10n, source: 'static' },
    { name: 'KarwanEscrow', kind: 'settlement', address: B, deployBlock: 20n, source: 'static' },
    { name: 'KarwanDealEscrow', kind: 'settlement', address: C, deployBlock: 30n, source: 'discovered' },
  ];
  const r = retirement(ledger, [B, C]);
  assert.deepEqual(r.get(A.toLowerCase()), { status: 'retired', version: 1, of: 2 });
  assert.deepEqual(r.get(B.toLowerCase()), { status: 'live', version: 2, of: 2 });
  assert.deepEqual(r.get(C.toLowerCase()), { status: 'live', version: 1, of: 1 });
});
