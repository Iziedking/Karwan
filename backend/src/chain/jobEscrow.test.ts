import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, erc20Abi, getAddress, toFunctionSelector, type Hex, type Log, type TransactionReceipt } from 'viem';
import {
  awardCall,
  contestPayouts,
  createJobCall,
  enterCall,
  fundJobCalls,
  jobEscrowAbi,
  openBountyCalls,
  proveAwarded,
  proveFunded,
  proveOpened,
} from './jobEscrow.js';

/// The job escrow on the family (view 40): contests and outside-agent jobs.

const JOBS: Hex = getAddress('0xea06b70c0808c2ad9b6316758407284fdad9d550');
const USDC: Hex = getAddress('0x3600000000000000000000000000000000000000');
const BUYER_AGENT: Hex = getAddress('0x1111111111111111111111111111111111111111');
const A: Hex = getAddress('0x00000000000000000000000000000000000000a1');
const B: Hex = getAddress('0x00000000000000000000000000000000000000b2');
const C: Hex = getAddress('0x00000000000000000000000000000000000000c3');
const id32 = (n: bigint) => `0x${n.toString(16).padStart(64, '0')}` as Hex;

test('the calls match the deployed contract', () => {
  // The forge artifact's method identifiers, each found in the bytecode at
  // 0xEA06…D550 on Arc Testnet on 29 Oct 2026.
  const deployed: Record<string, string> = {
    openBounty: '776d5e3c', enter: 'f2342bde', award: 'bf039a99', fund: 'd2e13f50',
    createJobWithTerms: '5044bbe4', setBudget: 'dd4ae9d4', submit: '9e63798d', complete: 'd75bbdf3',
    reject: '41dd26f5', release: '37bdc99b', claimRefund: '5b7baf64', disputeRejection: '9c24dffb', confirmRejection: 'c6157427',
  };
  for (const [name, selector] of Object.entries(deployed)) {
    const f = jobEscrowAbi.find((x) => x.type === 'function' && x.name === name);
    assert.ok(f, name);
    assert.equal(toFunctionSelector(f as never), `0x${selector}`, name);
  }
});

test('a three-place contest pays the contract amounts and nothing comes back', () => {
  const p = contestPayouts(300_000_000n, 100, [5000, 3000, 2000], 3);
  assert.deepEqual(p.gross, [150_000_000n, 90_000_000n, 60_000_000n]);
  assert.deepEqual(p.net, [149_250_000n, 89_550_000n, 59_700_000n]);
  assert.equal(p.fee, 3_000_000n);
  assert.equal(p.funded, 301_500_000n);
  assert.equal(p.back, 0n);
});

test('one winner of three after entries close returns the other places', () => {
  const p = contestPayouts(300_000_000n, 100, [5000, 3000, 2000], 1);
  assert.deepEqual(p.net, [149_250_000n]);
  assert.equal(p.fee, 1_500_000n);
  assert.equal(p.back, 301_500_000n - 149_250_000n - 1_500_000n);
});

test('opening a contest approves exactly the prize and half the fee, then opens it', () => {
  const calls = openBountyCalls({
    jobs: JOBS, usdc: USDC, prize: 300_000_000n, feeBps: 100, evaluator: BUYER_AGENT,
    entriesBy: 1_800_000_000n, awardBy: 1_800_604_800n, shares: [5000, 3000, 2000], description: 'Best logo',
  });
  assert.equal(calls.length, 2);
  const approve = decodeFunctionData({ abi: erc20Abi, data: calls[0]!.data });
  assert.deepEqual(approve.args, [JOBS, 301_500_000n]);
  const open = decodeFunctionData({ abi: jobEscrowAbi, data: calls[1]!.data });
  assert.equal(open.functionName, 'openBounty');
  assert.equal(calls[1]!.to, JOBS);
});

test('entering and awarding name the contest and the winners in place order', () => {
  const e = decodeFunctionData({ abi: jobEscrowAbi, data: enterCall(JOBS, 7n, id32(9n)).data });
  assert.deepEqual(e.args, [7n, id32(9n)]);
  const w = decodeFunctionData({ abi: jobEscrowAbi, data: awardCall(JOBS, 7n, [A, B, C]).data });
  assert.deepEqual(w.args, [7n, [A, B, C]]);
});

function receipt(logs: Array<{ abi: unknown; eventName: string; args: Record<string, unknown>; address?: Hex }>, status: 'success' | 'reverted' = 'success'): TransactionReceipt {
  return {
    status,
    logs: logs.map((l) => {
      const ev = (l.abi as Array<{ type: string; name: string; inputs: Array<{ name: string; type: string; indexed?: boolean }> }>).find((x) => x.type === 'event' && x.name === l.eventName)!;
      const topics = encodeEventTopics({ abi: l.abi as never, eventName: l.eventName as never, args: l.args as never });
      const plain = ev.inputs.filter((i) => !i.indexed);
      const data = encodeAbiParameters(plain as never, plain.map((i) => l.args[i.name]) as never);
      return { address: l.address ?? JOBS, topics, data } as unknown as Log;
    }),
  } as unknown as TransactionReceipt;
}

test('opening is proved by the escrow event with the exact terms', () => {
  const ok = receipt([{ abi: jobEscrowAbi, eventName: 'BountyOpened', args: { jobId: 4n, client: BUYER_AGENT, evaluator: BUYER_AGENT, prize: 300_000_000n, entriesBy: 10n, awardBy: 20n } }]);
  assert.equal(proveOpened(ok, { jobs: JOBS, client: BUYER_AGENT, evaluator: BUYER_AGENT, prize: 300_000_000n, entriesBy: 10n, awardBy: 20n }), 4n);
  assert.throws(() => proveOpened(ok, { jobs: JOBS, client: BUYER_AGENT, evaluator: BUYER_AGENT, prize: 299_000_000n, entriesBy: 10n, awardBy: 20n }));
  const other = receipt([{ abi: jobEscrowAbi, eventName: 'BountyOpened', address: USDC, args: { jobId: 4n, client: BUYER_AGENT, evaluator: BUYER_AGENT, prize: 300_000_000n, entriesBy: 10n, awardBy: 20n } }]);
  assert.throws(() => proveOpened(other, { jobs: JOBS, client: BUYER_AGENT, evaluator: BUYER_AGENT, prize: 300_000_000n, entriesBy: 10n, awardBy: 20n }));
});

test('an award is proved only when each winner is paid their net', () => {
  const paid = (to: Hex, amount: bigint) => ({ abi: jobEscrowAbi, eventName: 'Paid', args: { dealId: id32(4n), to, amount, toAssignee: false } });
  const ok = receipt([paid(A, 149_250_000n), paid(B, 89_550_000n), paid(C, 59_700_000n)]);
  proveAwarded(ok, { jobs: JOBS, jobId: 4n, winners: [A, B, C], net: [149_250_000n, 89_550_000n, 59_700_000n] });
  assert.throws(() => proveAwarded(ok, { jobs: JOBS, jobId: 4n, winners: [A, B, C], net: [149_250_000n, 89_550_000n, 59_800_000n] }));
  assert.throws(() => proveAwarded(receipt([], 'reverted'), { jobs: JOBS, jobId: 4n, winners: [A], net: [1n] }));
});

test('an outside agent job is created naming Karwan as reviewer and funded at the quoted budget', () => {
  const create = decodeFunctionData({ abi: jobEscrowAbi, data: createJobCall({ jobs: JOBS, provider: A, evaluator: B, expiredAt: 1_900_000_000n, description: 'Logo' }).data });
  assert.equal(create.functionName, 'createJobWithTerms');
  assert.deepEqual(create.args.slice(0, 4), [A, B, 1_900_000_000n, 'Logo']);
  assert.deepEqual(create.args[4], { reviewWindow: 5 * 86_400, partialBps: 5000, fallbackBps: 5000 });
  const fund = fundJobCalls({ jobs: JOBS, usdc: USDC, jobId: 3n, budget: 110_000_000n, feeBps: 100 });
  assert.deepEqual(decodeFunctionData({ abi: erc20Abi, data: fund[0]!.data }).args, [JOBS, 110_550_000n]);
  assert.deepEqual(decodeFunctionData({ abi: jobEscrowAbi, data: fund[1]!.data }).args, [3n, 110_000_000n, '0x']);
});

test('funding is proved against the job the agent claims', () => {
  const ok = receipt([{ abi: jobEscrowAbi, eventName: 'JobFunded', args: { jobId: 3n, client: C, amount: 110_000_000n } }]);
  proveFunded(ok, { jobs: JOBS, jobId: 3n, client: C, budget: 110_000_000n });
  assert.throws(() => proveFunded(ok, { jobs: JOBS, jobId: 3n, client: A, budget: 110_000_000n }));
  assert.throws(() => proveFunded(ok, { jobs: JOBS, jobId: 2n, client: C, budget: 110_000_000n }));
  assert.throws(() => proveFunded(ok, { jobs: JOBS, jobId: 3n, client: C, budget: 100_000_000n }));
});
