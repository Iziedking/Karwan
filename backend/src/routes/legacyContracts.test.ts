import assert from 'node:assert/strict';
import test from 'node:test';
import type { Address } from 'viem';
import type { SessionPayload } from '../auth/session.js';
import { LEGACY_STATE, type LegacyDeal } from '../chain/legacyContracts.js';
import type { LegacyVaultPosition } from '../chain/legacyLive.js';
import { createLegacyContractRoutes, type LegacyDeps } from './legacyContracts.js';

const ME = '0x00000000000000000000000000000000000000aa';
const MY_BUYER = '0x00000000000000000000000000000000000000ab';
const OTHER = '0x00000000000000000000000000000000000000cc';
const OLD_VAULT = '0x3fe7bddea2b1d5255a0e865222dae00eeefc45da' as Address;
const PREVIOUS_VAULT = '0xa600bd772a032ec2b96a9a44545024e270418927' as Address;
const OLD_ESCROW = '0xe796bcdbdbfd01a8a01d640e0d3fecd21b127f95' as Address;
const JOB = `0x${'11'.repeat(32)}`;
const NOW = 1_800_000_000;
const U = 1_000_000n;

function harness(opts: { method?: 'circle' | 'web3'; simulate?: boolean; positions?: LegacyVaultPosition[]; deal?: LegacyDeal | null; dbBuyer?: string } = {}) {
  const executed: Array<{ walletId: string; contract: string; sig: string; params: string[] }> = [];
  const after: string[] = [];
  let session: SessionPayload | null = { address: ME, method: opts.method ?? 'circle', exp: 9e9 } as SessionPayload;
  const deps: LegacyDeps = {
    session: () => session,
    wallets: async () => ({
      identity: { address: ME, walletId: opts.method === 'web3' ? null : 'id-wallet' },
      buyer: { address: MY_BUYER, walletId: 'buyer-wallet' },
      seller: null,
    }),
    dealsFor: async () => [{ jobId: JOB, buyer: opts.dbBuyer ?? ME, seller: OTHER, buyerAgentWalletId: 'buyer-wallet', sellerAgentWalletId: 'their-seller' }],
    findDeal: async () =>
      opts.deal === null ? null : { escrow: OLD_ESCROW, deal: opts.deal ?? { buyer: MY_BUYER as Address, seller: OTHER as Address, lockedMicros: 20n * U, state: LEGACY_STATE.Funded } },
    vaultPositionsFor: async () =>
      opts.positions ?? [
        { vault: OLD_VAULT, positionId: 4n, owner: ME as Address, principalMicros: 250n * U, claimableAt: 0, state: 1 },
        { vault: PREVIOUS_VAULT, positionId: 9n, owner: ME as Address, principalMicros: 10n * U, claimableAt: NOW - 1, state: 2 },
      ],
    simulates: async () => opts.simulate ?? true,
    previousVault: PREVIOUS_VAULT,
    now: () => NOW,
    execute: async (walletId, contract, sig, params) => {
      executed.push({ walletId, contract, sig, params });
      return { txHash: `0x${'ef'.repeat(32)}` };
    },
    confirmed: async () => true,
    afterStep: async (e) => { after.push(`${e.kind}:${e.step}`); },
  };
  const app = createLegacyContractRoutes(deps);
  const call = (method: string, path: string, body?: unknown) =>
    app.request(path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { call, executed, after, setSession: (s: SessionPayload | null) => { session = s; } };
}

test('the page needs a session', async () => {
  const h = harness();
  h.setSession(null);
  assert.equal((await h.call('GET', '/positions')).status, 401);
});

test('it lists what the person still has, each with the step that works now', async () => {
  const body = await (await harness().call('GET', '/positions')).json();
  assert.equal(body.deals.length, 1);
  assert.deepEqual(body.deals[0], { contract: OLD_ESCROW, jobId: JOB, role: 'buyer', otherSide: OTHER, amountUsdc: '20', state: 'funded', steps: ['releaseFinal', 'refund'], heldByKarwan: false });
  assert.equal(body.guarantees.length, 2);
  assert.deepEqual(body.guarantees[0], { contract: OLD_VAULT, positionId: '4', amountUsdc: '250', state: 'in_place', readyAt: null, steps: ['requestWithdraw'], heldByKarwan: false, previous: false });
  assert.equal(body.guarantees[1].previous, true);
  assert.deepEqual(body.guarantees[1].steps, ['claim', 'cancelWithdraw']);
});

test('a position whose steps would all fail is shown as held by Karwan, never hidden', async () => {
  const body = await (await harness({ simulate: false }).call('GET', '/positions')).json();
  assert.equal(body.guarantees[0].heldByKarwan, true);
  assert.deepEqual(body.guarantees[0].steps, []);
});

test('a deal where the person is the seller shows with nothing to sign', async () => {
  const body = await (await harness({ dbBuyer: OTHER }).call('GET', '/positions')).json();
  assert.equal(body.deals[0].role, 'seller');
  assert.deepEqual(body.deals[0].steps, []);
  assert.equal(body.deals[0].heldByKarwan, false);
});

test('Karwan signs a guarantee step from the wallet that owns it', async () => {
  const h = harness();
  const res = await h.call('POST', '/step', { kind: 'guarantee', contract: OLD_VAULT, ref: '4', step: 'requestWithdraw' });
  assert.equal(res.status, 200);
  assert.deepEqual(h.executed, [{ walletId: 'id-wallet', contract: OLD_VAULT, sig: 'requestWithdraw(uint256)', params: ['4'] }]);
  assert.deepEqual(h.after, ['guarantee:requestWithdraw']);
});

test('taking money back from a funded older deal disputes it first, signed by the buying agent', async () => {
  const h = harness();
  const res = await h.call('POST', '/step', { kind: 'deal', contract: OLD_ESCROW, ref: JOB, step: 'refund' });
  assert.equal(res.status, 200);
  assert.deepEqual(h.executed.map((e) => [e.walletId, e.contract, e.sig]), [['buyer-wallet', OLD_ESCROW, 'dispute(bytes32,string)'], ['buyer-wallet', OLD_ESCROW, 'refund(bytes32)']]);
});

test('a step the position does not offer now is refused', async () => {
  const h = harness();
  const res = await h.call('POST', '/step', { kind: 'guarantee', contract: OLD_VAULT, ref: '4', step: 'claim' });
  assert.equal(res.status, 409);
  assert.equal(h.executed.length, 0);
});

test('someone else\'s position cannot be found, so cannot be acted on', async () => {
  const h = harness({ positions: [] });
  assert.equal((await h.call('POST', '/step', { kind: 'guarantee', contract: OLD_VAULT, ref: '4', step: 'requestWithdraw' })).status, 404);
});

test('an own wallet gets the calls to sign instead', async () => {
  const h = harness({ method: 'web3' });
  const res = await h.call('POST', '/step', { kind: 'guarantee', contract: OLD_VAULT, ref: '4', step: 'requestWithdraw' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.calls.length, 1);
  assert.equal(body.calls[0].to, OLD_VAULT);
  assert.equal(h.executed.length, 0);
});
