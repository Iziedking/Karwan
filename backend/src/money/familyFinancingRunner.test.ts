import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeAbiParameters, encodeEventTopics, type Hex, type Log, type TransactionReceipt } from 'viem';
import type { FactoringOffer } from '../db/factoring.js';
import { tradeFinanceAbi } from '../chain/tradeFinance.js';
import type { Receivable } from './familyFinancing.js';
import { runFamilyFinancingPass, type RunnerDeps } from './familyFinancingRunner.js';

/// Karwan settles each family line once its deal ends, and keeps the hold on
/// the seller's deal guarantee for as long as the deal can still run.

const TF: Hex = '0xaeeada6aef8b07262224f010264ef1968177c779';
const LINE: Hex = `0x${'4c'.repeat(32)}`;
const line = (over: Partial<FactoringOffer> = {}) =>
  ({ id: 'o1', invoiceId: '0xjob', financier: '0xf1', seller: '0x5e', status: 'accepted', rail: 'family', lineId: LINE, expectedReturnUsdc: '123.6', ...over }) as FactoringOffer;
const r = (over: Partial<Receivable> = {}): Receivable => ({ asset: '0x36', seller: '0xa9', unpaid: 0n, horizon: 1_000n, open: false, financeable: false, ...over });

function receipt(eventName: 'LineRepaid' | 'LineDefaulted' | 'LineWaived', data: Hex): TransactionReceipt {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const topics = encodeEventTopics({ abi: tradeFinanceAbi as any, eventName, args: { lineId: LINE } } as any) as Hex[];
  const log = { address: TF, topics, data, blockHash: null, blockNumber: null, logIndex: 0, transactionHash: '0x5e77', transactionIndex: 0, removed: false } as unknown as Log;
  return { status: 'success', transactionHash: '0x5e77', logs: [log] } as unknown as TransactionReceipt;
}

function deps(over: Partial<RunnerDeps> = {}) {
  const sent: string[] = [];
  const patched: Array<[string, Partial<FactoringOffer>]> = [];
  const told: unknown[] = [];
  const logs: string[] = [];
  const d: RunnerDeps = {
    lines: async () => [line()],
    receivable: async () => r(),
    holdEnd: async () => 1_000n + 210n * 86_400n,
    send: async (fn) => { sent.push(fn); return receipt('LineRepaid', encodeAbiParameters([{ type: 'uint256' }], [123_600_000n])); },
    patch: async (id, p) => { patched.push([id, p]); },
    tell: async (o, outcome) => { told.push([o.id, outcome]); },
    log: (m) => logs.push(m),
    now: () => 5,
    ...over,
  };
  return { d, sent, patched, told, logs };
}

test('a finished deal is settled once and the line reads repaid', async () => {
  const { d, sent, patched, told } = deps();
  await runFamilyFinancingPass(d);
  assert.deepEqual(sent, ['settle']);
  assert.deepEqual(patched, [['o1', { status: 'repaid', settledAt: 5, settleTxHash: '0x5e77' }]]);
  assert.deepEqual(told, [['o1', { state: 'repaid' }]]);
});

test('a shortfall reads defaulted with what came from the guarantee', async () => {
  const data = encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }], [20_000_000n, 12_000_000n]);
  const { d, patched } = deps({ send: async () => receipt('LineDefaulted', data) });
  await runFamilyFinancingPass(d);
  assert.deepEqual(patched, [['o1', { status: 'defaulted', settledAt: 5, settleTxHash: '0x5e77', fromGuaranteeMicros: '12000000' }]]);
});

test('a given-up line reads waived', async () => {
  const { d, patched } = deps({ send: async () => receipt('LineWaived', '0x') });
  await runFamilyFinancingPass(d);
  assert.equal(patched[0]![1].status, 'waived');
});

test('a live deal whose end moved later gets its hold kept', async () => {
  const { d, sent, patched } = deps({ receivable: async () => r({ open: true, horizon: 2_000n }) });
  await runFamilyFinancingPass(d);
  assert.deepEqual(sent, ['keepStake']);
  assert.deepEqual(patched, []);
});

test('a live deal with enough hold is left alone', async () => {
  const { d, sent } = deps({ receivable: async () => r({ open: true }) });
  await runFamilyFinancingPass(d);
  assert.deepEqual(sent, []);
});

test('a revert is logged and retried next pass, and the other lines still run', async () => {
  let calls = 0;
  const { d, patched, logs } = deps({
    lines: async () => [line(), line({ id: 'o2' })],
    send: async () => {
      calls += 1;
      if (calls === 1) throw new Error('execution reverted: StillLive');
      return receipt('LineRepaid', encodeAbiParameters([{ type: 'uint256' }], [1n]));
    },
  });
  await runFamilyFinancingPass(d);
  assert.equal(logs.length, 1);
  assert.deepEqual(patched.map(([id]) => id), ['o2']);
});

test('settling pays gas from the yield operator wallet, never the treasury key', async () => {
  const { settleKey } = await import('./familyFinancingRunner.js');
  const yieldKey = `0x${'1'.repeat(64)}`;
  const treasuryKey = `0x${'2'.repeat(64)}`;
  assert.equal(settleKey({ OPERATOR_PRIVATE_KEY: yieldKey, USYC_OPERATOR_PRIVATE_KEY: treasuryKey }), yieldKey);
  assert.equal(settleKey({ USYC_OPERATOR_PRIVATE_KEY: treasuryKey }), null);
});
