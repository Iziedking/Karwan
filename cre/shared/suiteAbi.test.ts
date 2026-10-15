import { describe, expect, test } from 'bun:test';
import { encodeAbiParameters, keccak256, toBytes, toEventSelector } from 'viem';
import { agreementAbi, agreementTermsAbi, adapterAbi, type AgreementTermsValue } from './suiteAbi.js';

const event = (name: string, abi: readonly unknown[]) => {
  const item = (abi as { type: string; name: string }[]).find((i) => i.type === 'event' && i.name === name);
  if (!item) throw new Error(`no event ${name}`);
  return toEventSelector(item as Parameters<typeof toEventSelector>[0]);
};

describe('suite ABI', () => {
  test('event topics match the deployed suite (computed with cast keccak)', () => {
    expect(event('Delivered', agreementAbi)).toBe('0xd45beba397c83fdda516d54bb097da4de94910b65c27d164acabb48abe741efc');
    expect(event('CheckReported', agreementAbi)).toBe('0x29df591d6d197b908c14d47dadf966a51e968dfec34c9f1bd5658f19b1915466');
    expect(event('RecordPending', agreementAbi)).toBe('0x183e28ff67e52a157f23eb6d61dc73c49777856338f13e43c0cb7504014ea1e3');
    expect(event('PayoutCredited', agreementAbi)).toBe('0xe9452bb2e2b0e6cf560d1269f57cbd45a3a5a39dbe2cbe33db4b08e5febe6906');
    expect(event('DisputeOpened', agreementAbi)).toBe('0xf10b951b278ce6146e6c1cd00b762a4e1ece12bda0cda603f330c4cb1874faf9');
  });

  test('the terms tuple hashes like termsHashOf (Foundry vector, CreVectors.t.sol)', () => {
    const t: AgreementTermsValue = {
      asset: '0x00000000000000000000000000000000000a55e7',
      seller: '0x00000000000000000000000000000000005e11e2',
      amount: 250_000_000n,
      trancheBps: [6000, 4000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      acceptBy: 1_800_000_000n,
      deliveryDeadline: 1_801_000_000n,
      reclaimGrace: 2 * 86400,
      reviewWindow: 3 * 86400,
      startLongstop: 4 * 86400,
      extensionSecs: 86400,
      silentLongstop: 14 * 86400,
      reviewStarts: 2,
      maxExtensions: 2,
      finalRelease: 1,
      silenceOutcome: 0,
      partialBps: 5000,
      fallbackBps: 2500,
      parts: 0,
      partEvery: 0,
      cancelFeeBps: 0,
      sellerStake: 10_000_000n,
      verifier: '0x00000000000000000000000000000000000c4ec4',
      checkPolicy: keccak256(toBytes('policy')),
      agreementHash: keccak256(toBytes('agreement')),
    };
    expect(keccak256(encodeAbiParameters([agreementTermsAbi], [t]))).toBe('0x5f8b3fed76a77cfc7acd75f7f5498d7e3a79ea6b1cca5c892645ddea42c7cd9b');
  });

  test('the adapter ABI has the event the backend reads', () => {
    expect(event('CheckApproved', adapterAbi)).toBe(
      keccak256(toBytes('CheckApproved(address,address,bytes32,uint32,bool,bytes32,bytes32)')),
    );
  });
});

describe('dispute view', () => {
  test('disputeOf decodes the Dispute struct in field order', () => {
    const fn = (agreementAbi as readonly { type: string; name?: string; outputs?: { components?: { name: string }[] }[] }[])
      .find((i) => i.type === 'function' && i.name === 'disputeOf');
    expect(fn?.outputs?.[0].components?.map((c) => c.name)).toEqual(['opener', 'openedAt', 'proposed', 'escalated', 'proposedBps', 'proposedAt', 'escalatedAt']);
  });
});
