import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

/// Mainnet runs wallet-only: the four core addresses stay unset, so the two
/// registries deployed there cannot come from the env (a partial core set stops
/// the process). They come from the published deployment record instead, and
/// the public contract list must show them.
///
///   npx tsx --test src/chain/currentContractsMainnet.test.ts

process.env.ARC_NETWORK = 'mainnet';
for (const k of [
  'KARWAN_JOBBOARD_ADDR',
  'KARWAN_ESCROW_ADDR',
  'KARWAN_REPUTATION_ADDR',
  'KARWAN_VAULT_ADDR',
  'KARWAN_BUSINESS_REGISTRY_ADDR',
]) delete process.env[k];

const { configuredContracts, PUBLISHED_REGISTRIES } = await import('./currentContracts.js');

const REPUTATION = '0xa8E41F941b44CA091E3Ab7b600fe1484838aE27D';
const BUSINESS_REGISTRY = '0x69eA60B6EFd13A126Eb00d25aB0f21A4AfC636eF';

test('the mainnet registries are listed with no address in the env', () => {
  const listed = configuredContracts().filter((c) => !!c.address);
  assert.deepEqual(
    listed.map((c) => [c.name, c.address]),
    [
      ['KarwanReputation', REPUTATION],
      ['KarwanBusinessRegistry', BUSINESS_REGISTRY],
    ],
  );
  assert.ok(listed.every((c) => c.kind === 'registry' && !c.holdsUsdc));
});

test('the published addresses match the deployment record', () => {
  const file = resolve(process.cwd(), '..', 'contracts', 'deployments', 'registries-5042.json');
  assert.ok(existsSync(file), `missing ${file}`);
  const record = JSON.parse(readFileSync(file, 'utf8')) as { chainId: number; reputation: string; businessRegistry: string };
  assert.equal(record.chainId, 5042);
  assert.deepEqual(PUBLISHED_REGISTRIES[5042], {
    reputation: record.reputation,
    businessRegistry: record.businessRegistry,
  });
});
