import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCreSettings } from './settings.js';

test('off by default, with the fallback after an hour', () => {
  const s = parseCreSettings({});
  assert.equal(s.suiteEnabled, false);
  assert.equal(s.creEnabled, false);
  assert.equal(s.fallbackAfterMs, 3_600_000);
  assert.equal(s.reportTrust, 'verified');
  assert.equal(s.gatewayUrl, 'https://01.gateway.zone-a.cre.chain.link');
});

test('reads the switches and addresses', () => {
  const s = parseCreSettings({
    CRE_SUITE_ENABLED: 'true',
    CRE_ENABLED: '1',
    CRE_FALLBACK_AFTER_MS: '7200000',
    CRE_ADAPTER_ADDR: '0x00000000000000000000000000000000000ada97',
    CRE_WORKFLOW_IDS: '0xaa,0xbb',
  });
  assert.equal(s.suiteEnabled, true);
  assert.equal(s.creEnabled, true);
  assert.equal(s.fallbackAfterMs, 7_200_000);
  assert.equal(s.adapter, '0x00000000000000000000000000000000000ada97');
  assert.deepEqual(s.workflowIds, ['0xaa', '0xbb']);
});

test('simulation trust is refused in production', () => {
  assert.throws(() => parseCreSettings({ CRE_REPORT_TRUST: 'simulation', NODE_ENV: 'production' }), /CRE_REPORT_TRUST/);
  assert.equal(parseCreSettings({ CRE_REPORT_TRUST: 'simulation', NODE_ENV: 'development' }).reportTrust, 'simulation');
});

test('a fallback shorter than ten minutes is refused', () => {
  assert.throws(() => parseCreSettings({ CRE_FALLBACK_AFTER_MS: '1000' }));
});

test('reads the dry-run fee contract and the relayer key that pays its gas', () => {
  const key = `0x${'4'.repeat(64)}`;
  const s = parseCreSettings({ CRE_FEES_ADDR: `0x${'fe'.repeat(20)}`, CRE_RELAYER_KEY: key });
  assert.equal(s.fees, `0x${'fe'.repeat(20)}`);
  assert.equal(s.relayerKey, key);
  assert.throws(() => parseCreSettings({ CRE_RELAYER_KEY: 'not a key' }));
});
