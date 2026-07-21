import { projectFor } from '../routes/events.js';
import type { KarwanEvent } from '../events.js';

/// Verifies the SSE projection: a caller sees their OWN money events in full
/// and everyone else's as an empty pulse. Run after touching projectFor or the
/// key lists — this is the boundary that keeps one user's amounts, addresses
/// and tx hashes out of another user's stream.
///
///   npx tsx src/scripts/events-projection-check.ts

const ME = '0xaaaa000000000000000000000000000000000001';
const THEM = '0xbbbb000000000000000000000000000000000002';

const ev = (type: string, payload: Record<string, unknown>): KarwanEvent =>
  ({ type, actor: 'buyer', ts: Date.now(), payload }) as KarwanEvent;

const cases: Array<{ name: string; e: KarwanEvent; caller: string | null; bridges: string[]; full: boolean }> = [
  // The regression this was written for: bridge events name no party, so they
  // used to reach their own owner stripped to {}.
  { name: 'my bridge, seeded', e: ev('bridge.burned', { bridgeId: 'b1', sourceTxHash: '0xdead' }), caller: ME, bridges: ['b1'], full: true },
  { name: 'my bridge, minted', e: ev('bridge.minted', { bridgeId: 'b1', txHash: '0xbeef' }), caller: ME, bridges: ['b1'], full: true },
  { name: 'my bridge, error', e: ev('bridge.error', { bridgeId: 'b1', message: 'x' }), caller: ME, bridges: ['b1'], full: true },
  // The boundary: someone else's bridge must stay a pulse.
  { name: "another user's bridge", e: ev('bridge.burned', { bridgeId: 'b9', sourceTxHash: '0xdead' }), caller: ME, bridges: ['b1'], full: false },
  { name: 'unknown bridge id', e: ev('bridge.minted', { bridgeId: 'unknown', txHash: '0x1' }), caller: ME, bridges: [], full: false },
  { name: 'signed out', e: ev('bridge.minted', { bridgeId: 'b1', txHash: '0x1' }), caller: null, bridges: ['b1'], full: false },
  // Owner-keyed personal money events.
  { name: 'my agent funding (user)', e: ev('agent.funded', { user: ME, amountUsdc: '5' }), caller: ME, bridges: [], full: true },
  { name: 'my stake (address)', e: ev('vault.deposited', { address: ME, amountUsdc: '5' }), caller: ME, bridges: [], full: true },
  { name: 'my wallet credit (owner)', e: ev('wallet.credited', { owner: ME, amountUsdc: '5' }), caller: ME, bridges: [], full: true },
  { name: "another user's agent funding", e: ev('agent.funded', { user: THEM, amountUsdc: '5' }), caller: ME, bridges: [], full: false },
  { name: "another user's stake", e: ev('vault.deposited', { address: THEM, amountUsdc: '5' }), caller: ME, bridges: [], full: false },
  { name: "another user's wallet credit", e: ev('wallet.credited', { owner: THEM, amountUsdc: '5' }), caller: ME, bridges: [], full: false },
  // Case-insensitivity: addresses arrive checksummed from some emitters.
  { name: 'checksummed owner still matches', e: ev('wallet.credited', { owner: ME.toUpperCase() }), caller: ME, bridges: [], full: true },
  // Deal scoping must be untouched by the new branch.
  { name: 'my deal as buyer', e: ev('escrow.released', { buyer: ME, amountUsdc: '5' }), caller: ME, bridges: [], full: true },
  { name: "another user's deal", e: ev('escrow.released', { buyer: THEM, amountUsdc: '5' }), caller: ME, bridges: [], full: false },
];

let failed = 0;
for (const c of cases) {
  const out = projectFor(c.e, c.caller, new Set<string>(), new Set<string>(), new Set(c.bridges));
  const isFull = Object.keys(out.payload ?? {}).length > 0;
  const ok = isFull === c.full;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}: ${isFull ? 'full' : 'pulse'}, expected ${c.full ? 'full' : 'pulse'}`);
}
console.log(failed ? `\n${failed} FAILED` : `\nall ${cases.length} passed`);
process.exit(failed ? 1 : 0);
