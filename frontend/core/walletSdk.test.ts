import assert from 'node:assert/strict';
import test from 'node:test';
import type { CreateConnectorFn } from 'wagmi';
import { sdkWhenUsed } from './walletSdk';

/// A connector that counts how often its SDK would have been loaded.
function fake(type: string, recent: string | null) {
  const loads = { setup: 0, provider: 0, connect: 0 };
  const create = (() => ({
    id: type === 'walletConnect' ? 'walletConnect' : type,
    name: type,
    type,
    async setup() { loads.setup += 1; },
    async getProvider() { loads.provider += 1; return { sdk: true }; },
    async connect() { loads.connect += 1; return { accounts: [], chainId: 1 }; },
  })) as unknown as CreateConnectorFn;
  const config = { storage: { getItem: async (key: string) => (key === 'recentConnectorId' ? recent : null) } };
  const connector = (sdkWhenUsed(create) as unknown as (c: typeof config) => Record<string, (...a: unknown[]) => Promise<unknown>> & { setup?: unknown })(config);
  return { connector, loads };
}

test('WalletConnect is not loaded at startup for someone who never used it', async () => {
  const { connector, loads } = fake('walletConnect', 'io.metamask');
  assert.equal(connector.setup, undefined);
  assert.equal(await connector.getProvider(), undefined);
  assert.deepEqual(loads, { setup: 0, provider: 0, connect: 0 });
});

test('picking it in the wallet list loads it and sets it up once', async () => {
  const { connector, loads } = fake('walletConnect', null);
  await connector.getProvider();
  assert.deepEqual(await connector.getProvider(), { sdk: true });
  await connector.connect();
  assert.deepEqual(loads, { setup: 1, provider: 1, connect: 1 });
});

test('the wallet used last time reconnects as before', async () => {
  const { connector, loads } = fake('coinbaseWallet', 'coinbaseWallet');
  assert.deepEqual(await connector.getProvider(), { sdk: true });
  assert.equal(loads.setup, 1);
});

test('connecting straight away is never refused', async () => {
  const { connector, loads } = fake('walletConnect', null);
  await connector.connect();
  assert.deepEqual(await connector.getProvider(), { sdk: true });
  assert.deepEqual(loads, { setup: 1, provider: 1, connect: 1 });
});

test('small connectors are left exactly as they are', async () => {
  const create = (() => ({ id: 'injected', type: 'injected', setup: async () => {} })) as unknown as CreateConnectorFn;
  const connector = (sdkWhenUsed(create) as unknown as (c: object) => { setup?: unknown })({});
  assert.equal(typeof connector.setup, 'function');
});
