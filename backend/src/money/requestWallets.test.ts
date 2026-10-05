import assert from 'node:assert/strict';
import test from 'node:test';
import { provisionRequestWallets, type WalletProvider } from './requestWallets.js';

const EVM = ['ETH-SEPOLIA', 'BASE-SEPOLIA', 'ARB-SEPOLIA'];

function fakeProvider(over: Partial<WalletProvider> = {}) {
  const calls: string[] = [];
  let n = 0;
  let inFlight = 0;
  let maxInFlight = 0;
  const provider: WalletProvider = {
    async create({ blockchain }) {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      calls.push(`create:${blockchain}`);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      n += 1;
      return blockchain === 'SOL-DEVNET'
        ? { id: `sol-${n}`, address: `So1ana${n}` }
        : { id: `evm-${n}`, address: `0x${n.toString(16).padStart(40, '0')}` };
    },
    async derive({ walletId, blockchain }) {
      calls.push(`derive:${blockchain}`);
      const k = walletId.replace('evm-', '');
      return { id: `${walletId}-${blockchain}`, address: `0x${Number(k).toString(16).padStart(40, '0')}` };
    },
    ...over,
  };
  return { provider, calls, maxInFlight: () => maxInFlight };
}

test('one created EVM wallet, the other EVM chains derived from it, and one Solana wallet', async () => {
  const { provider, calls } = fakeProvider();
  const out = await provisionRequestWallets('tok-1', { provider, evmChains: EVM, solanaChain: 'SOL-DEVNET', isKnownAddress: async () => false });
  assert.deepEqual(calls, ['create:ETH-SEPOLIA', 'derive:BASE-SEPOLIA', 'derive:ARB-SEPOLIA', 'create:SOL-DEVNET']);
  assert.equal(Object.keys(out.evm.wallets).length, 3);
  assert.equal(out.evm.wallets['ETH-SEPOLIA'], 'evm-1');
  assert.ok(out.solana?.address.startsWith('So1ana'));
});

test('creates never run at the same time, so two requests cannot be handed one address', async () => {
  const fake = fakeProvider();
  const deps = { provider: fake.provider, evmChains: EVM, solanaChain: null, isKnownAddress: async () => false };
  const [a, b] = await Promise.all([provisionRequestWallets('tok-a', deps), provisionRequestWallets('tok-b', deps)]);
  assert.equal(fake.maxInFlight(), 1);
  assert.notEqual(a.evm.address, b.evm.address);
});

test('the same request asked twice at once is made once', async () => {
  const fake = fakeProvider();
  const deps = { provider: fake.provider, evmChains: EVM, solanaChain: null, isKnownAddress: async () => false };
  const [a, b] = await Promise.all([provisionRequestWallets('tok-same', deps), provisionRequestWallets('tok-same', deps)]);
  assert.equal(a.evm.address, b.evm.address);
  assert.equal(fake.calls.filter((c) => c.startsWith('create')).length, 1);
});

test('an address that already belongs to someone is never used', async () => {
  const { provider } = fakeProvider();
  await assert.rejects(
    provisionRequestWallets('tok-x', { provider, evmChains: EVM, solanaChain: null, isKnownAddress: async () => true }),
    /already in use/,
  );
});

test('a derived address that differs from the first is refused rather than shown', async () => {
  const { provider } = fakeProvider({
    async derive({ blockchain }) {
      return { id: `d-${blockchain}`, address: '0x' + 'e'.repeat(40) };
    },
  });
  await assert.rejects(
    provisionRequestWallets('tok-d', { provider, evmChains: EVM, solanaChain: null, isKnownAddress: async () => false }),
    /differs/,
  );
});
