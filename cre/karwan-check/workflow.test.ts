import { describe, expect, test } from 'bun:test';
import { configSchema, initWorkflow, type Config } from './workflow.js';

const base: Config = {
  schedule: '0 * * * * *',
  chainId: 5_042_002,
  chainSelectorName: 'arc-testnet',
  families: ['0x00000000000000000000000000000000000fa411'],
  verifiers: ['0x00000000000000000000000000000000000c4ec4'],
  attest: false,
  adapter: '0x00000000000000000000000000000000000ada97',
  karwanApi: 'https://api.karwan.site',
  apiTokenSecretId: 'CRE_WORKFLOW_TOKEN',
  githubTokenSecretId: 'GITHUB_REPLAY_TOKEN',
  runnerRef: 'main',
  runnerRepo: 'karwan-xyz/karwan-replay',
  gatewayKey: '0x0000000000000000000000000000000000000abc',
  gasLimit: '600000',
  maxItems: 3,
};

describe('karwan-check config', () => {
  test('accepts the staging shape', () => {
    expect(configSchema.parse(base)).toEqual(base);
  });

  test('watches at most five family escrows, the log trigger limit', () => {
    const six = Array.from({ length: 6 }, (_, i) => `0x${(i + 1).toString(16).padStart(40, '0')}`);
    expect(() => configSchema.parse({ ...base, families: six })).toThrow();
    expect(() => configSchema.parse({ ...base, families: [] })).toThrow();
  });

  test('takes at most three items a run, the HTTP budget', () => {
    expect(() => configSchema.parse({ ...base, maxItems: 4 })).toThrow();
  });

  test('refuses a zero adapter when attesting, and unknown keys', () => {
    expect(() => configSchema.parse({ ...base, attest: true, adapter: '0x0000000000000000000000000000000000000000' })).toThrow();
    expect(() => configSchema.parse({ ...base, extra: 1 })).toThrow();
  });

  test('needs the pinned runner repository', () => {
    const { runnerRepo: _r, ...rest } = base;
    expect(() => configSchema.parse(rest)).toThrow();
  });

  test('needs an absolute https API', () => {
    expect(() => configSchema.parse({ ...base, karwanApi: 'api.karwan.site' })).toThrow();
  });

  test('every tracked config file parses', async () => {
    for (const name of ['config.staging.json', 'config.production.json']) {
      const raw = await Bun.file(new URL(`./${name}`, import.meta.url)).json();
      expect(() => configSchema.parse(raw)).not.toThrow();
    }
  });

  test('registers the delivery log, the schedule and the dry-run trigger, in that order', () => {
    const handlers = initWorkflow(base);
    expect(handlers).toHaveLength(3);
  });
});
