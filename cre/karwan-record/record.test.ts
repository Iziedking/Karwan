import { describe, expect, test } from 'bun:test';
import { decodeAbiParameters, keccak256, parseAbiParameters, toBytes, type Address, type Hex } from 'viem';
import { FACT } from '../shared/adapterReport.js';
import { proofMessage } from './gist.js';
import { handleWorkRequest, WORK_FACT_KIND, type RecordConfig, type RecordPorts } from './record.js';

const WALLET = '0x00000000000000000000000000000000000a11ce' as Address;
const ADAPTER = '0x00000000000000000000000000000000000ada97' as Address;
const NOW = Date.parse('2026-10-15T00:00:00Z') / 1000;
const DAY = 86_400;
const SIG = `0x${'1b'.repeat(65)}` as Hex;
const config: RecordConfig = { chainId: 5_042_002, adapter: ADAPTER };

function harness(over: Partial<{
  gistOwner: string;
  gistText: string | null;
  signatureOk: boolean;
  createdAt: number;
  merged: { repo: string; mergedAt: number }[] | null;
  stars: Record<string, number>;
}> = {}) {
  const written: Hex[] = [];
  const merged = Array.from({ length: 12 }, (_, i) => ({ repo: `org${i % 4}/repo`, mergedAt: NOW - (i + 1) * DAY }));
  const s = {
    gistOwner: 'ada',
    gistText: `${proofMessage(WALLET, 'ada', '2026-10-10')}\nsignature: ${SIG}\n` as string | null,
    signatureOk: true,
    createdAt: NOW - 800 * DAY,
    merged: merged as { repo: string; mergedAt: number }[] | null,
    stars: {} as Record<string, number>,
    ...over,
  };
  const ports: RecordPorts = {
    now: () => NOW,
    gist: () => (s.gistText === null ? null : { owner: s.gistOwner, text: s.gistText }),
    user: () => ({ id: 4242, createdAt: s.createdAt }),
    mergedPrs: () => s.merged,
    stars: () => s.stars,
    verifySignature: () => s.signatureOk,
    sealKey: () => keccak256(toBytes('seal key')),
    writeReport: (r) => {
      written.push(r);
      return { ok: true };
    },
  };
  return { ports, written };
}

const decodeFact = (report: Hex) => {
  const [kind, , , , , body] = decodeAbiParameters(parseAbiParameters('uint8, uint256, address, uint64, bytes32, bytes'), report);
  const [op, wallet, factKind, level, seal, expiresAt, factId] = decodeAbiParameters(
    parseAbiParameters('uint8, address, bytes32, uint8, bytes32, uint64, uint256'),
    body,
  );
  return { kind, op, wallet: wallet.toLowerCase(), factKind, level, seal, expiresAt, factId };
};

const request = { op: 1 as const, wallet: WALLET, login: 'ada', gistId: 'abc123' };

describe('GitHub work facts', () => {
  test('writes a level-1 fact with a keyed seal and a year of validity', () => {
    const { ports, written } = harness();
    expect(handleWorkRequest(ports, config, request)).toEqual({ outcome: 'written', level: 1 });
    const f = decodeFact(written[0]);
    expect(f).toMatchObject({ kind: FACT, op: 1, wallet: WALLET, factKind: WORK_FACT_KIND, level: 1, expiresAt: BigInt(NOW + 365 * DAY) });
    expect(f.seal).not.toBe(keccak256(toBytes('ada')));
  });

  test('the seal changes with the key, so it cannot be guessed from public data', () => {
    const a = harness();
    handleWorkRequest(a.ports, config, request);
    const b = harness();
    b.ports.sealKey = () => keccak256(toBytes('another key'));
    handleWorkRequest(b.ports, config, request);
    expect(decodeFact(a.written[0]).seal).not.toBe(decodeFact(b.written[0]).seal);
  });

  test('no fact below level 1', () => {
    const { ports, written } = harness({ merged: [] });
    expect(handleWorkRequest(ports, config, request)).toEqual({ outcome: 'no-fact', level: 0 });
    expect(written).toHaveLength(0);
  });

  test('refuses a gist owned by someone else, a bad signature or a missing gist', () => {
    expect(handleWorkRequest(harness({ gistOwner: 'eve' }).ports, config, request)).toEqual({ outcome: 'GIST_OWNER_MISMATCH' });
    expect(handleWorkRequest(harness({ signatureOk: false }).ports, config, request)).toEqual({ outcome: 'BAD_SIGNATURE' });
    expect(handleWorkRequest(harness({ gistText: null }).ports, config, request)).toEqual({ outcome: 'GIST_UNAVAILABLE' });
    expect(handleWorkRequest(harness({ gistText: 'hello' }).ports, config, request)).toEqual({ outcome: 'BAD_PROOF' });
  });

  test('a GitHub outage writes nothing', () => {
    const { ports, written } = harness({ merged: null });
    expect(handleWorkRequest(ports, config, request)).toEqual({ outcome: 'unavailable' });
    expect(written).toHaveLength(0);
  });

  test('revokes a fact on the same proof, naming the wallet the adapter checks', () => {
    const { ports, written } = harness();
    expect(handleWorkRequest(ports, config, { ...request, op: 2, factId: '17' })).toEqual({ outcome: 'revoked' });
    expect(decodeFact(written[0])).toMatchObject({ op: 2, wallet: WALLET, factId: 17n });
  });

  test('refuses a malformed request', () => {
    const { ports } = harness();
    expect(handleWorkRequest(ports, config, { ...request, wallet: 'nope' as Address })).toEqual({ outcome: 'bad-request' });
    expect(handleWorkRequest(ports, config, { ...request, op: 2 })).toEqual({ outcome: 'bad-request' });
  });
});
