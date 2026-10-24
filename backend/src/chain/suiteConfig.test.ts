import assert from 'node:assert/strict';
import test from 'node:test';
import { SuiteConfigError, checkSuiteOnChain, suiteAddresses, type SuiteAddresses, type SuiteReads } from './suiteConfig.js';

const DEPLOYED: SuiteAddresses = {
  hub: '0xB874C290B82c0689De75Eaf9434774f83da138a6',
  identity: '0x5409e859E1604b6Efa01827CCd3d2D7aaB1e3D5D',
  record: '0x0C92895864d5D8D245f6A84b66EbeFEab88fbD41',
  agreement: '0x55460D2b8b0D8067Ea33406b310224B5bd44F43C',
  verifier: '0xCD395b291bcEcbFd58a3b8253C70510dd7bdAAa8',
  tradeFinance: '0xAeEAda6aef8B07262224F010264eF1968177C779',
};

const env = (over: Record<string, unknown> = {}) => ({
  SUITE_ENABLED: true,
  KARWAN_SUITE_HUB_ADDR: DEPLOYED.hub,
  KARWAN_SUITE_IDENTITY_ADDR: DEPLOYED.identity,
  KARWAN_SUITE_RECORD_ADDR: DEPLOYED.record,
  KARWAN_SUITE_AGREEMENT_ADDR: DEPLOYED.agreement,
  KARWAN_SUITE_VERIFIER_ADDR: DEPLOYED.verifier,
  KARWAN_SUITE_TRADE_FINANCE_ADDR: DEPLOYED.tradeFinance,
  ...over,
});

/// The chain as the deployed suite answers once the first settings are executed.
function chain(over: Partial<SuiteReads> = {}): SuiteReads {
  return {
    code: async () => '0x6080',
    hubIdentity: async () => DEPLOYED.identity,
    hubRecord: async () => DEPLOYED.record,
    isFamily: async (a) => a.toLowerCase() === DEPLOYED.agreement.toLowerCase(),
    isVerifier: async (a) => a.toLowerCase() === DEPLOYED.verifier.toLowerCase(),
    ...over,
  };
}

async function refusal(addrs: SuiteAddresses, reads: SuiteReads): Promise<string> {
  try {
    await checkSuiteOnChain(addrs, reads);
  } catch (err) {
    assert.ok(err instanceof SuiteConfigError);
    return err.check;
  }
  throw new Error('expected the boot check to refuse');
}

test('returns_null_when_disabled', () => {
  assert.equal(suiteAddresses(env({ SUITE_ENABLED: false })), null);
});

test('returns_null_when_any_address_missing', () => {
  for (const key of ['KARWAN_SUITE_HUB_ADDR', 'KARWAN_SUITE_IDENTITY_ADDR', 'KARWAN_SUITE_RECORD_ADDR', 'KARWAN_SUITE_AGREEMENT_ADDR', 'KARWAN_SUITE_VERIFIER_ADDR', 'KARWAN_SUITE_TRADE_FINANCE_ADDR']) {
    assert.equal(suiteAddresses(env({ [key]: undefined })), null, key);
  }
});

test('returns_all_six_when_enabled', () => {
  assert.deepEqual(suiteAddresses(env()), DEPLOYED);
});

test('boot_check_refuses_an_address_with_no_code', async () => {
  assert.equal(await refusal(DEPLOYED, chain({ code: async (a) => (a === DEPLOYED.record ? '0x' : '0x6080') })), 'code:record');
});

test('boot_check_refuses_a_hub_pointing_at_another_identity_or_record', async () => {
  assert.equal(await refusal(DEPLOYED, chain({ hubIdentity: async () => DEPLOYED.record })), 'hub-identity');
  assert.equal(await refusal(DEPLOYED, chain({ hubRecord: async () => DEPLOYED.identity })), 'hub-record');
});

test('boot_check_refuses_an_agreement_that_is_not_a_family', async () => {
  assert.equal(await refusal(DEPLOYED, chain({ isFamily: async () => false })), 'agreement-family');
});

test('boot_check_refuses_a_verifier_the_hub_does_not_list', async () => {
  assert.equal(await refusal(DEPLOYED, chain({ isVerifier: async () => false })), 'verifier-listed');
});

test('boot_check_passes_on_the_deployed_shape', async () => {
  await checkSuiteOnChain(DEPLOYED, chain());
});

test('funding_on_the_suite_waits_for_the_boot_check', async () => {
  const { bootSuiteCheck, suiteFundingEnabled } = await import('./suiteConfig.js');
  // The test environment has the suite switched off, so nothing opens on it.
  assert.equal(await bootSuiteCheck(chain()), false);
  assert.equal(suiteFundingEnabled(), false);
});

test('new_deals_stay_put_while_karwan_keys_are_missing', async () => {
  const { suiteReady } = await import('./suiteConfig.js');
  assert.deepEqual(await suiteReady(DEPLOYED, chain(), 'the arbiter key is not a private key'), { ready: false, reason: 'the arbiter key is not a private key' });
  assert.deepEqual(await suiteReady(DEPLOYED, chain(), null), { ready: true, reason: null });
  assert.deepEqual(await suiteReady(DEPLOYED, chain({ isFamily: async () => false }), null), { ready: false, reason: 'agreement-family' });
});
