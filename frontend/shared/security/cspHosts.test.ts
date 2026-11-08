import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { arbitrum, avalanche, base, hyperEvm, mainnet, optimism, polygon, sei, sonic, unichain, worldchain } from 'viem/chains';
import { CONNECT_HOSTS, FRAME_HOSTS } from './cspHosts';

/// Every RPC the wallet and bridge code can call is allowed by the page policy,
/// so adding a chain cannot quietly break it (view 70).
///
///   npx tsx --test shared/security/cspHosts.test.ts

const frontendRoot = path.resolve(__dirname, '..', '..');
const RPC_FILES = ['core/wagmi.ts', 'core/adminWagmi.ts', 'core/arcNetwork.ts', 'features/bridge/config.ts'];
/// Explorer, faucet and docs links are opened in a new tab, not called.
const NOT_RPC = /explorer|scan|blockscout|faucet|subnets|example|\.invalid|docs?\.|github|x\.com|t\.me|\/\/app\.|\/\/www\.|karwan\.site/;

function literalOrigins(file: string): string[] {
  const source = fs.readFileSync(path.join(frontendRoot, file), 'utf8');
  const found = source.match(/\b(?:https|wss):\/\/[a-zA-Z0-9.-]+\.[a-z]{2,}/g) ?? [];
  return [...new Set(found)].filter((o) => !NOT_RPC.test(o));
}

const allowed = new Set(CONNECT_HOSTS);

test('every RPC written in the wallet and bridge code is allowed', () => {
  const missing = RPC_FILES.flatMap((f) => literalOrigins(f).filter((o) => !allowed.has(o)).map((o) => `${o} (${f})`));
  assert.deepEqual(missing, []);
});

test('every mainnet source chain RPC that viem picks by default is allowed', () => {
  const chains = [mainnet, base, optimism, arbitrum, polygon, avalanche, unichain, sei, sonic, worldchain, hyperEvm];
  const missing = chains
    .flatMap((c) => c.rpcUrls.default.http)
    .map((u) => new URL(u).origin)
    .filter((o) => !allowed.has(o));
  assert.deepEqual([...new Set(missing)], []);
});

test('the host lists hold bare origins only', () => {
  for (const h of [...CONNECT_HOSTS, ...FRAME_HOSTS]) {
    assert.equal(new URL(h).origin, h, h);
    assert.match(h, /^(https|wss):\/\//, h);
  }
  assert.equal(new Set(CONNECT_HOSTS).size, CONNECT_HOSTS.length, 'no repeats');
});
