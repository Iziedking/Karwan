import { describe, expect, test } from 'bun:test';
import { decodeAbiParameters, encodeAbiParameters, keccak256, parseAbiParameters, toBytes, type Address, type Hex } from 'viem';
import { KEEP, KEEP_SELECTORS } from '../shared/adapterReport.js';
import type { AgreementView, DisputeView } from './due.js';
import { onRecordLog, sweep, type OpenDeal, type RiskConfig, type RiskPorts } from './risk.js';

const FAMILY = '0x00000000000000000000000000000000000fa411' as Address;
const TIME = '0x0000000000000000000000000000000000071e00' as Address;
const JOBS = '0x0000000000000000000000000000000000000b05' as Address;
const ADAPTER = '0x00000000000000000000000000000000000ada97' as Address;
const NOW = 1_800_000_000;
const DAY = 86_400;
const deal = (n: number) => keccak256(toBytes(`deal-${n}`));
const config: RiskConfig = { chainId: 5_042_002, adapter: ADAPTER, maxDeals: 3, families: [FAMILY, TIME, JOBS] };

function harness(open: OpenDeal[], views: Record<string, AgreementView>, refuse: Set<string> = new Set()) {
  const calls = { written: [] as Hex[], alerts: [] as unknown[], simulated: 0, reads: 0, cursor: -1 };
  const dispute: DisputeView = { openedAt: 0, proposed: false, escalated: false, proposedAt: 0, escalatedAt: 0 };
  const ports: RiskPorts = {
    now: () => NOW,
    openDeals: (limit, cursor) => {
      calls.cursor = cursor;
      return open.slice(0, limit);
    },
    agreementDeal: (_f, id) => {
      calls.reads++;
      return views[id];
    },
    disputeOf: () => {
      calls.reads++;
      return dispute;
    },
    simulate: (c) => {
      calls.simulated++;
      calls.reads++;
      return !refuse.has(`${c.selector}:${c.args}`);
    },
    writeReport: (r) => {
      calls.written.push(r);
      return { ok: true };
    },
    postAlerts: (a) => {
      calls.alerts.push(...a);
    },
  };
  return { ports, calls };
}

const decodeKeep = (report: Hex) => {
  const [kind, , , , , body] = decodeAbiParameters(parseAbiParameters('uint8, uint256, address, uint64, bytes32, bytes'), report);
  const [keepCalls] = decodeAbiParameters(parseAbiParameters('(address family, bytes4 selector, bytes args)[]'), body);
  return { kind, calls: keepCalls };
};

const due: AgreementView = { state: 2, deliveredAt: NOW - 10 * DAY, deadline: NOW + 5 * DAY, reviewEnd: NOW - DAY, checkFailed: false, partsPaid: 0 };

describe('the sweep', () => {
  test('writes one keeper report with the calls the chain confirms', () => {
    const open: OpenDeal[] = [
      { kind: 'agreement', family: FAMILY, id: deal(1) },
      { kind: 'agreement', family: FAMILY, id: deal(2) },
    ];
    const { ports, calls } = harness(open, { [deal(1)]: due, [deal(2)]: due }, new Set([`${KEEP_SELECTORS['claim(bytes32)']}:${deal(2)}`]));
    const result = sweep(ports, config);
    expect(result).toMatchObject({ calls: 1, alerts: 0, written: true });
    const r = decodeKeep(calls.written[0]);
    expect(r.kind).toBe(KEEP);
    expect(r.calls).toHaveLength(1);
    expect(r.calls[0].args).toBe(deal(1));
  });

  test('takes Time and Jobs timeouts only from the allowed list, and still confirms them', () => {
    const settleArgs = encodeAbiParameters(parseAbiParameters('bytes32, uint16'), [deal(3), 0]);
    const releaseArgs = encodeAbiParameters(parseAbiParameters('uint256'), [7n]);
    const open: OpenDeal[] = [
      { kind: 'time', family: TIME, id: deal(3), suggest: [{ signature: 'settle(bytes32,uint16)', args: settleArgs }] },
      { kind: 'job', family: JOBS, id: '0x07', suggest: [{ signature: 'release(uint256)', args: releaseArgs }, { signature: 'attestCheck(bytes32,uint32,bool,bytes32)', args: '0x' }] },
    ];
    const { ports, calls } = harness(open, {});
    expect(sweep(ports, config)).toMatchObject({ calls: 2, written: true });
    const r = decodeKeep(calls.written[0]);
    expect(r.calls.map((c) => c.selector)).toEqual([KEEP_SELECTORS['settle(bytes32,uint16)'], KEEP_SELECTORS['release(uint256)']]);
  });

  test('ignores deals in families it was not configured for', () => {
    const open: OpenDeal[] = [{ kind: 'agreement', family: '0x000000000000000000000000000000000000dead', id: deal(1) }];
    const { ports, calls } = harness(open, { [deal(1)]: due });
    expect(sweep(ports, config)).toMatchObject({ calls: 0, written: false });
    expect(calls.simulated).toBe(0);
  });

  test('writes nothing when nothing is due, and keeps a batch to four calls', () => {
    const quiet = harness([{ kind: 'agreement', family: FAMILY, id: deal(1) }], { [deal(1)]: { ...due, reviewEnd: NOW + DAY } });
    expect(sweep(quiet.ports, config)).toMatchObject({ calls: 0, written: false });
    expect(quiet.calls.written).toHaveLength(0);

    const suggest = Array.from({ length: 10 }, (_, i) => ({ signature: 'release(uint256)' as const, args: encodeAbiParameters(parseAbiParameters('uint256'), [BigInt(i)]) }));
    const busy = harness([{ kind: 'job', family: JOBS, id: '0x01', suggest }], {});
    expect(sweep(busy.ports, config)).toMatchObject({ calls: 4 });
  });

  test('pages through the watch list a minute at a time, so no deal waits behind the first three', () => {
    const { ports, calls } = harness([], {});
    sweep(ports, config);
    expect(calls.cursor).toBe(Math.floor(NOW / 60));
  });

  test('stays within fifteen chain reads a run, counting every view and simulation', () => {
    const refused = new Set<string>();
    const suggest = Array.from({ length: 12 }, (_, i) => {
      const args = encodeAbiParameters(parseAbiParameters('uint256'), [BigInt(i)]);
      refused.add(`${KEEP_SELECTORS['release(uint256)']}:${args}`);
      return { signature: 'release(uint256)' as const, args };
    });
    const open: OpenDeal[] = [
      { kind: 'agreement', family: FAMILY, id: deal(1) },
      { kind: 'job', family: JOBS, id: '0x01', suggest },
      { kind: 'job', family: JOBS, id: '0x02', suggest },
    ];
    const { ports, calls } = harness(open, { [deal(1)]: due }, refused);
    sweep(ports, config);
    expect(calls.reads).toBe(15);
  });

  test('posts alerts for the people involved and never holds anything', () => {
    const open: OpenDeal[] = [{ kind: 'agreement', family: FAMILY, id: deal(1) }];
    const { ports, calls } = harness(open, { [deal(1)]: { ...due, deliveredAt: 0, reviewEnd: 0, deadline: NOW + DAY / 2 } });
    expect(sweep(ports, config)).toMatchObject({ alerts: 1 });
    expect(calls.alerts[0]).toMatchObject({ kind: 'deadline_near_no_delivery', dealId: deal(1) });
  });
});

describe('record and payout logs', () => {
  test('a pending record becomes a retryRecord call', () => {
    const { ports, calls } = harness([], {});
    expect(onRecordLog(ports, config, { kind: 'record-pending', family: FAMILY, dealId: deal(1), party: 1 })).toBe('kept');
    const r = decodeKeep(calls.written[0]);
    expect(r.calls[0].selector).toBe(KEEP_SELECTORS['retryRecord(bytes32,uint8)']);
    expect(r.calls[0].args).toBe(encodeAbiParameters(parseAbiParameters('bytes32, uint8'), [deal(1), 1]));
  });

  test('a payout that could not be delivered becomes an alert', () => {
    const { ports, calls } = harness([], {});
    expect(onRecordLog(ports, config, { kind: 'payout-credited', family: FAMILY, to: ADAPTER, amount: 5n })).toBe('alerted');
    expect(calls.alerts[0]).toEqual({ kind: 'owed_balance', family: FAMILY, to: ADAPTER, amount: '5' });
  });
});
