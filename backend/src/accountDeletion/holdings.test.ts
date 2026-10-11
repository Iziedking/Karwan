import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentWallets } from '../db/agentWallets.js';
import { holdingsOf, type HoldingReaders } from './holdings.js';

const ID = `0x${'1'.repeat(40)}`;
const BUYER = `0x${'2'.repeat(40)}`;
const SELLER = `0x${'3'.repeat(40)}`;
const DEPOSIT = `0x${'4'.repeat(40)}`;
const LEGACY = `0x${'5'.repeat(40)}`;
const X402 = `0x${'6'.repeat(40)}`;
const SOL = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';

const record: AgentWallets = {
  userAddress: ID,
  buyerWalletId: 'b',
  buyerAddress: BUYER,
  sellerWalletId: 's',
  sellerAddress: SELLER,
  createdAt: 1,
  bridgeWallets: { 'BASE-SEPOLIA': { walletId: 'd', address: DEPOSIT }, 'SOL-DEVNET': { walletId: 'sol', address: SOL } },
  legacyBridgeWallets: { 'BASE-SEPOLIA': [{ walletId: 'l', address: LEGACY }] },
  x402Wallet: { walletId: 'x', address: X402 },
};
const chains = [
  { key: 'baseSepolia', circleBlockchain: 'BASE-SEPOLIA' },
  { key: 'sepolia', circleBlockchain: 'ETH-SEPOLIA' },
];

function readers(over: Partial<HoldingReaders> = {}) {
  const asked: string[] = [];
  const zero = (what: string) => async (...args: string[]) => {
    asked.push(`${what}:${args.join(':')}`);
    return 0n;
  };
  const r: HoldingReaders = {
    arc: zero('arc'),
    chain: zero('chain'),
    solana: zero('solana'),
    unified: zero('unified'),
    gatewayDeposit: zero('gateway'),
    stake: zero('stake'),
    ...over,
  };
  return { r, asked };
}

test('every wallet is read on Arc, on each chain Karwan signs on, on Solana, and the unified balance, x402 and stake', async () => {
  const { r, asked } = readers();
  const rows = await holdingsOf(ID, record, chains, r);
  for (const a of [ID, BUYER, SELLER, X402]) assert.ok(asked.includes(`arc:${a}`), `arc ${a}`);
  for (const a of [ID, BUYER, SELLER, DEPOSIT, LEGACY]) assert.ok(asked.includes(`chain:baseSepolia:${a}`), `base ${a}`);
  for (const a of [ID, BUYER, SELLER]) assert.ok(asked.includes(`chain:sepolia:${a}`), `ethereum ${a}`);
  assert.ok(!asked.includes(`chain:sepolia:${DEPOSIT}`), 'a deposit wallet is read on its own chain');
  assert.ok(asked.includes(`solana:${SOL}`));
  assert.ok(asked.includes(`unified:${ID}`));
  assert.ok(asked.includes(`gateway:${X402}`));
  assert.ok(asked.includes(`stake:${ID}`));
  assert.equal(new Set(asked).size, asked.length, 'nothing is read twice');
  assert.ok(rows.every((h) => h.micros === 0n));
});

test('a read that fails is null, not zero, and the others still count', async () => {
  const { r } = readers({
    chain: async (key) => {
      if (key === 'sepolia') throw new Error('rpc down');
      return 0n;
    },
    stake: async () => 5_000_000n,
  });
  const rows = await holdingsOf(ID, record, chains, r);
  assert.ok(rows.some((h) => h.where.startsWith('sepolia') && h.micros === null));
  assert.equal(rows.find((h) => h.where === 'stake')?.micros, 5_000_000n);
});

test('an account with no agent wallets still has its own wallet, unified balance and stake read', async () => {
  const { r, asked } = readers();
  await holdingsOf(ID, null, chains, r);
  assert.deepEqual(asked.sort(), [`arc:${ID}`, `chain:baseSepolia:${ID}`, `chain:sepolia:${ID}`, `stake:${ID}`, `unified:${ID}`].sort());
});
