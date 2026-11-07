import assert from 'node:assert/strict';
import test from 'node:test';
import {
  owedOperationKey,
  owedSources,
  personWallets,
  proveOwedWithdrawal,
  readOwedLines,
  scanOwedSource,
  withdrawOwedCall,
  type OwedSource,
} from './owed.js';

const USDC = '0x3600000000000000000000000000000000000000';
const AGREEMENT = '0x55460d2b8b0d8067ea33406b310224b5bd44f43c';
const VAULT = '0xf5fd1fd6d790da42c022a5c5404676c048007ed5';
const CRE = '0x9553ff79b13f27d767b2a94bb8428a8e6a7d9c7e';
const ME = '0x1111111111111111111111111111111111111111';
const SELLER = '0x2222222222222222222222222222222222222222';
const BUYER = '0x3333333333333333333333333333333333333333';

test('only the contracts that are set are read, and the CRE fees contract has no asset', () => {
  const sources = owedSources({ agreement: AGREEMENT, jobs: null, time: undefined, vault: VAULT, cre: CRE });
  assert.deepEqual(sources.map((s) => [s.contract, s.perAsset]), [['agreement', true], ['vault', true], ['cre', false]]);
});

test('a person is read on their own address and on every agent wallet, each once', () => {
  const wallets = personWallets({
    address: ME.toUpperCase().replace('0X', '0x'),
    identityWalletId: null,
    agents: {
      buyerAddress: BUYER, buyerWalletId: 'w-buyer',
      sellerAddress: SELLER, sellerWalletId: 'w-seller',
      x402Wallet: { address: SELLER, walletId: 'w-seller' },
    },
  });
  assert.deepEqual(wallets, [
    { address: ME, walletId: null },
    { address: BUYER, walletId: 'w-buyer' },
    { address: SELLER, walletId: 'w-seller' },
  ]);
  assert.deepEqual(personWallets({ address: ME, identityWalletId: 'w-me', agents: null }), [{ address: ME, walletId: 'w-me' }]);
});

test('only owed amounts above zero become lines, and a failed read is counted, never read as zero', async () => {
  const sources: OwedSource[] = owedSources({ agreement: AGREEMENT, vault: VAULT, cre: CRE });
  const wallets = [{ address: ME, walletId: null }, { address: SELLER, walletId: 'w-seller' }];
  const out = await readOwedLines(sources, wallets, async (source, wallet) => {
    if (source.contract === 'agreement' && wallet.address === SELLER) return 40_000_000n;
    if (source.contract === 'cre' && wallet.address === ME) return 250_000n;
    if (source.contract === 'vault' && wallet.address === ME) throw new Error('rpc down');
    return 0n;
  });
  assert.deepEqual(
    out.lines.map((l) => [l.id, l.amountMicros, l.walletId]),
    [[`agreement:${SELLER}`, 40_000_000n, 'w-seller'], [`cre:${ME}`, 250_000n, null]],
  );
  assert.equal(out.totalMicros, 40_250_000n);
  assert.equal(out.unread, 1);
});

test('the withdraw call names the asset only where the contract keeps owed per asset', () => {
  const [agreement, , cre] = owedSources({ agreement: AGREEMENT, vault: VAULT, cre: CRE });
  assert.deepEqual(withdrawOwedCall(agreement!, USDC), { signature: 'withdrawOwed(address)', params: [USDC] });
  assert.deepEqual(withdrawOwedCall(cre!, USDC), { signature: 'withdrawOwed()', params: [] });
});

test('one operation per contract, wallet and request', () => {
  assert.equal(owedOperationKey(`agreement:${SELLER}`, 'r1'), `owed:agreement:${SELLER}:r1`);
});

const proof = {
  status: 'success' as const,
  receiptFrom: SELLER,
  contractAddress: AGREEMENT,
  wallet: SELLER,
  usdc: USDC,
  amountMicros: 40_000_000n,
  withdrawn: [{ emitter: AGREEMENT, to: SELLER, amount: 40_000_000n }],
  transfers: [{ tokenAddress: USDC, from: AGREEMENT, to: SELLER, value: 40_000_000n }],
};

test('a withdrawal is proved by the contract event and the exact USDC paid to the owed wallet', () => {
  assert.doesNotThrow(() => proveOwedWithdrawal(proof));
});

test('a withdrawal is refused when it reverted, came from someone else, or paid a different amount or wallet', () => {
  assert.throws(() => proveOwedWithdrawal({ ...proof, status: 'reverted' }), /reverted/);
  assert.throws(() => proveOwedWithdrawal({ ...proof, receiptFrom: BUYER }), /sender/);
  assert.throws(() => proveOwedWithdrawal({ ...proof, withdrawn: [{ emitter: VAULT, to: SELLER, amount: 40_000_000n }] }), /OwedWithdrawn/);
  assert.throws(() => proveOwedWithdrawal({ ...proof, withdrawn: [{ emitter: AGREEMENT, to: SELLER, amount: 39_000_000n }] }), /OwedWithdrawn/);
  assert.throws(() => proveOwedWithdrawal({ ...proof, transfers: [{ tokenAddress: USDC, from: AGREEMENT, to: BUYER, value: 40_000_000n }] }), /USDC/);
});

test('the scan remembers each newly credited wallet once and moves its cursor in steps under 10,000 blocks', async () => {
  const windows: Array<[bigint, bigint]> = [];
  const remembered: string[] = [];
  const cursors: bigint[] = [];
  const known = new Set([`agreement:${BUYER}`]);
  const [source] = owedSources({ agreement: AGREEMENT });
  const found = await scanOwedSource(source!, 30_000n, {
    getLogs: async (_s, from, to) => {
      windows.push([from, to]);
      return from === 10_002n ? [{ to: SELLER.toUpperCase().replace('0X', '0x') }, { to: BUYER }, { to: undefined }] : [];
    },
    cursor: async () => 2n,
    saveCursor: async (_c, block) => void cursors.push(block),
    known: async (key) => known.has(key),
    remember: async (key, entry) => {
      known.add(key);
      remembered.push(`${key}:${entry.wallet}`);
    },
    now: () => 1,
  });
  assert.equal(found, 1);
  assert.deepEqual(remembered, [`agreement:${SELLER}:${SELLER}`]);
  assert.deepEqual(windows, [[3n, 10_001n], [10_002n, 20_000n], [20_001n, 29_999n], [30_000n, 30_000n]]);
  assert.ok(windows.every(([from, to]) => to - from < 10_000n));
  assert.deepEqual(cursors, [10_001n, 20_000n, 29_999n, 30_000n]);
});
