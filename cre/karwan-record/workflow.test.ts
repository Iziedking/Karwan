import { describe, expect, test } from 'bun:test';
import { configSchema, initWorkflow } from './workflow.js';

describe('karwan-record config', () => {
  test('every tracked config parses and registers one HTTP trigger', async () => {
    for (const name of ['config.staging.json', 'config.production.json']) {
      const raw = await Bun.file(new URL(`./${name}`, import.meta.url)).json();
      expect(initWorkflow(configSchema.parse(raw))).toHaveLength(1);
    }
  });

  test('needs the deployed adapter and refuses unknown keys', async () => {
    const raw = await Bun.file(new URL('./config.staging.json', import.meta.url)).json();
    expect(() => configSchema.parse({ ...raw, adapter: '0x0000000000000000000000000000000000000000' })).toThrow();
    expect(() => configSchema.parse({ ...raw, extra: true })).toThrow();
  });
});
