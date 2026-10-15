import { describe, expect, test } from 'bun:test';
import { configSchema, initWorkflow } from './workflow.js';

describe('karwan-risk config', () => {
  test('every tracked config parses', async () => {
    for (const name of ['config.staging.json', 'config.production.json']) {
      const raw = await Bun.file(new URL(`./${name}`, import.meta.url)).json();
      expect(() => configSchema.parse(raw)).not.toThrow();
    }
  });

  test('needs the deployed adapter, at most five families and three deals a run', async () => {
    const raw = await Bun.file(new URL('./config.staging.json', import.meta.url)).json();
    expect(() => configSchema.parse({ ...raw, adapter: '0x0000000000000000000000000000000000000000' })).toThrow();
    expect(() => configSchema.parse({ ...raw, maxDeals: 4 })).toThrow();
    const six = Array.from({ length: 6 }, (_, i) => `0x${(i + 1).toString(16).padStart(40, '0')}`);
    expect(() => configSchema.parse({ ...raw, families: six })).toThrow();
  });

  test('gives a keeper report room for four calls, inside the ten million gas cap', async () => {
    for (const name of ['config.staging.json', 'config.production.json']) {
      const raw = await Bun.file(new URL(`./${name}`, import.meta.url)).json();
      expect(Number(raw.gasLimit)).toBeGreaterThanOrEqual(7_000_000);
    }
    const raw = await Bun.file(new URL('./config.staging.json', import.meta.url)).json();
    expect(() => configSchema.parse({ ...raw, gasLimit: '10000001' })).toThrow();
  });

  test('registers the sweep and the family log trigger', async () => {
    const raw = await Bun.file(new URL('./config.staging.json', import.meta.url)).json();
    expect(initWorkflow(configSchema.parse(raw))).toHaveLength(2);
  });
});
