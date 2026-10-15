import { describe, expect, test } from 'bun:test';
import { decodeAbiParameters, keccak256, parseAbiParameters, toBytes, type Address, type Hex } from 'viem';
import {
  CHECK, DRY, FACT, KEEP, KEEP_SELECTORS, checkBody, checkDigest, dryBody, encodeEnvelope, factBody, keepBody,
} from './adapterReport.js';

const ADAPTER = '0x00000000000000000000000000000000000ada97' as Address;

describe('adapter reports', () => {
  test('the check digest matches the contract (Foundry vector, CreVectors.t.sol)', () => {
    expect(checkDigest({
      chainId: 5_042_002,
      verifier: '0x00000000000000000000000000000000000c4ec4',
      family: '0x000000000000000000000000000000000000f4a1',
      dealId: keccak256(toBytes('deal')),
      revision: 3,
      pass: true,
      evidenceHash: keccak256(toBytes('evidence')),
    })).toBe('0x255c3668615ec4ad815e07b1404c255ab19fcdae2c2689e759483bc12aa3050b');
  });

  test('an envelope decodes to its parts and its id is stable for the same inputs', () => {
    const body = checkBody({
      verifier: '0x00000000000000000000000000000000000c4ec4',
      family: '0x000000000000000000000000000000000000f4a1',
      dealId: keccak256(toBytes('deal')),
      revision: 1,
      pass: false,
      evidenceHash: keccak256(toBytes('evidence')),
    });
    const a = encodeEnvelope({ kind: CHECK, chainId: 5_042_002, adapter: ADAPTER, issuedAt: 1_800_000_000, body });
    const b = encodeEnvelope({ kind: CHECK, chainId: 5_042_002, adapter: ADAPTER, issuedAt: 1_800_000_000, body });
    expect(a.reportId).toBe(b.reportId);
    const [kind, chainId, adapter, issuedAt, reportId, decodedBody] = decodeAbiParameters(
      parseAbiParameters('uint8, uint256, address, uint64, bytes32, bytes'),
      a.report,
    );
    expect([kind, chainId, adapter.toLowerCase(), issuedAt, reportId, decodedBody]).toEqual(
      [CHECK, 5_042_002n, ADAPTER, 1_800_000_000n, a.reportId, body],
    );
    const later = encodeEnvelope({ kind: CHECK, chainId: 5_042_002, adapter: ADAPTER, issuedAt: 1_800_000_060, body });
    expect(later.reportId).not.toBe(a.reportId);
  });

  test('fact and keep bodies follow the frozen layouts', () => {
    const accountKey = keccak256(toBytes('account'));
    const fact = factBody({ op: 1, wallet: ADAPTER, factKind: keccak256(toBytes('karwan.fact.github_work.v1')), level: 2, evidenceSeal: keccak256(toBytes('s')), expiresAt: 1_900_000_000, factId: 0n, accountKey });
    const decoded = decodeAbiParameters(parseAbiParameters('uint8, address, bytes32, uint8, bytes32, uint64, uint256, bytes32'), fact);
    expect(decoded[0]).toBe(1);
    expect(decoded[3]).toBe(2);
    expect(decoded[7]).toBe(accountKey);
    const keep = keepBody([{ family: ADAPTER, selector: KEEP_SELECTORS['claim(bytes32)'], args: keccak256(toBytes('deal')) }]);
    const [calls] = decodeAbiParameters(parseAbiParameters('(address family, bytes4 selector, bytes args)[]'), keep);
    expect(calls[0].selector).toBe(KEEP_SELECTORS['claim(bytes32)']);
    expect([FACT, KEEP]).toEqual([2, 3]);
  });

  test('a dry-run answer names the fee contract, the run and the result', () => {
    const fees = '0x00000000000000000000000000000000000fee05' as Address;
    const runId = keccak256(toBytes('run'));
    const resultHash = keccak256(toBytes('result'));
    const [f, r, h] = decodeAbiParameters(parseAbiParameters('address, bytes32, bytes32'), dryBody({ fees, runId, resultHash }));
    expect([f.toLowerCase(), r, h]).toEqual([fees, runId, resultHash]);
    expect(DRY).toBe(4);
  });

  test('keeper selectors are the 15 the adapter is deployed with', () => {
    expect(Object.keys(KEEP_SELECTORS)).toHaveLength(15);
    expect(KEEP_SELECTORS['claim(bytes32)']).toBe(keccak256(toBytes('claim(bytes32)')).slice(0, 10) as Hex);
    expect(KEEP_SELECTORS['settle(bytes32,uint16)']).toBe(keccak256(toBytes('settle(bytes32,uint16)')).slice(0, 10) as Hex);
  });
});
