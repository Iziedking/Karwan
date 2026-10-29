import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, erc20Abi, hashTypedData, type Hex, type Log, type TransactionReceipt } from 'viem';
import {
  assignTypedData,
  holdUntil,
  lineIdFor,
  openCalls,
  proveOpen,
  reserveTypedData,
  settleOutcome,
  tradeFinanceAbi,
  type LineTerms,
} from './tradeFinance.js';

/// The seller's two signatures and the line id must be exactly what the
/// deployed contracts compute. The constants were read from Arc Testnet on
/// 29 Oct 2026 (block about 69.62M) with `cast call` on assignDigest,
/// reserveDigest and lineIdFor, using the inputs below.

const CHAIN = 5042002;
const ESCROW: Hex = '0x55460D2b8b0D8067Ea33406b310224B5bd44F43C';
const VAULT: Hex = '0xF5FD1fd6d790da42C022a5c5404676c048007ed5';
const TF: Hex = '0xAeEAda6aef8B07262224F010264eF1968177C779';
const USDC: Hex = '0x3600000000000000000000000000000000000000';
const DEAL: Hex = `0x${'11'.repeat(32)}`;
const SELLER: Hex = '0x5555555555555555555555555555555555555555';
const FINANCIER: Hex = '0xf1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1';
const ASSIGN_DIGEST = '0xc3fdff94bac2e57c6406c350af65c4c7fd42cf5c61c8babe30f6b8d6de0d70cd';
const RESERVE_DIGEST = '0x8a06bf3cb83dc35c275eb630e0443a6afb75b80b3cf34b2c5f51ab8d3906f6fa';
const LINE_ID = '0x700c8b3f444b044bd545270cadac7e6f2161b191348131e1caeaa1344289abe1';

const terms: LineTerms = { escrow: ESCROW, dealId: DEAL, financier: FINANCIER, advance: 120_000_000n, repay: 123_600_000n, stake: 12_000_000n };
const signed = {
  assign: { nonce: '7', deadline: '1900000000', sig: '0xaa' as Hex },
  reserve: { deadline: '1900000000', sig: '0xbb' as Hex },
  expiresAt: '1950000000',
};

test('assign typed data hashes to the escrow digest', () => {
  const typed = assignTypedData({ chainId: CHAIN, escrow: ESCROW, dealId: DEAL, payee: SELLER, assignee: FINANCIER, amount: 123_600_000n, submitter: TF, nonce: 7n, deadline: 1_900_000_000n });
  assert.equal(hashTypedData(typed), ASSIGN_DIGEST);
});

test('reserve typed data hashes to the vault digest', () => {
  const typed = reserveTypedData({ chainId: CHAIN, vault: VAULT, family: TF, ref: `0x${'22'.repeat(32)}`, asset: USDC, amount: 12_000_000n, beneficiary: FINANCIER, expiresAt: 1_950_000_000n, deadline: 1_900_000_000n });
  assert.equal(hashTypedData(typed), RESERVE_DIGEST);
});

test('line id matches the contract', () => {
  assert.equal(lineIdFor(CHAIN, TF, terms), LINE_ID);
});

test('holdUntil adds 210 days', () => {
  assert.equal(holdUntil(1_000n), 1_000n + 210n * 86_400n);
});

test('open calls approve exactly the advance, then open with the signed terms', () => {
  const [approve, open] = openCalls({ usdc: USDC, tradeFinance: TF, terms, signed });
  assert.equal(approve!.to, USDC);
  const a = decodeFunctionData({ abi: erc20Abi, data: approve!.data });
  assert.equal(a.functionName, 'approve');
  assert.deepEqual(a.args, [TF, 120_000_000n]);
  assert.equal(open!.to, TF);
  const o = decodeFunctionData({ abi: tradeFinanceAbi, data: open!.data });
  assert.equal(o.functionName, 'open');
  assert.deepEqual(o.args, [
    ESCROW, DEAL, 120_000_000n, 123_600_000n, 12_000_000n, 1_950_000_000n,
    { nonce: 7n, deadline: 1_900_000_000n, sig: '0xaa' },
    { deadline: 1_900_000_000n, sig: '0xbb' },
  ]);
});

function eventLog(address: Hex, abi: readonly unknown[], eventName: string, args: Record<string, unknown>, dataTypes: Array<{ type: string }>, dataValues: unknown[]): Log {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const topics = encodeEventTopics({ abi: abi as any, eventName, args } as any) as Hex[];
  return { address, topics, data: encodeAbiParameters(dataTypes, dataValues), blockHash: null, blockNumber: null, logIndex: 0, transactionHash: null, transactionIndex: 0, removed: false } as unknown as Log;
}

function opened(over: Partial<{ advance: bigint; to: Hex; lineId: Hex; skipLine: boolean }> = {}): TransactionReceipt {
  const logs: Log[] = [];
  if (!over.skipLine) {
    logs.push(eventLog(TF, tradeFinanceAbi, 'LineOpened', { lineId: over.lineId ?? LINE_ID, escrow: ESCROW, dealId: DEAL },
      [{ type: 'address' }, { type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }],
      [SELLER, FINANCIER, over.advance ?? terms.advance, terms.repay, terms.stake]));
  }
  logs.push(eventLog(USDC, erc20Abi, 'Transfer', { from: FINANCIER, to: over.to ?? SELLER }, [{ type: 'uint256' }], [over.advance ?? terms.advance]));
  return { status: 'success', logs } as unknown as TransactionReceipt;
}

const proof = { tradeFinance: TF, usdc: USDC, seller: SELLER, terms, lineId: LINE_ID as Hex };

test('proveOpen accepts the exact receipt', () => {
  assert.doesNotThrow(() => proveOpen(opened(), proof));
});

test('proveOpen refuses a wrong advance', () => {
  assert.throws(() => proveOpen(opened({ advance: 119_000_000n }), proof));
});

test('proveOpen refuses an advance paid to someone else', () => {
  assert.throws(() => proveOpen(opened({ to: '0x9999999999999999999999999999999999999999' }), proof));
});

test('proveOpen refuses a receipt with no LineOpened', () => {
  assert.throws(() => proveOpen(opened({ skipLine: true }), proof));
});

test('proveOpen refuses a reverted receipt', () => {
  assert.throws(() => proveOpen({ ...opened(), status: 'reverted' } as TransactionReceipt, proof));
});

test('settleOutcome reads repaid, defaulted with the guarantee part, and waived', () => {
  const repaid = eventLog(TF, tradeFinanceAbi, 'LineRepaid', { lineId: LINE_ID }, [{ type: 'uint256' }], [123_600_000n]);
  assert.deepEqual(settleOutcome([repaid], LINE_ID), { state: 'repaid' });
  const defaulted = eventLog(TF, tradeFinanceAbi, 'LineDefaulted', { lineId: LINE_ID }, [{ type: 'uint256' }, { type: 'uint256' }], [20_000_000n, 12_000_000n]);
  assert.deepEqual(settleOutcome([defaulted], LINE_ID), { state: 'defaulted', shortfallMicros: 20_000_000n, fromGuaranteeMicros: 12_000_000n });
  const waived = eventLog(TF, tradeFinanceAbi, 'LineWaived', { lineId: LINE_ID }, [], []);
  assert.deepEqual(settleOutcome([waived], LINE_ID), { state: 'waived' });
  assert.equal(settleOutcome([repaid], `0x${'00'.repeat(32)}`), null);
});
