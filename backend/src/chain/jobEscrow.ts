import { encodeFunctionData, erc20Abi, parseAbi, parseEventLogs, type Hex, type TransactionReceipt } from 'viem';

/// KarwanJobEscrow on the escrow family (view 40): contests, where the prize is
/// held from the start and the buyer picks up to three winners from the
/// entries, and outside-agent jobs, where only Karwan as reviewer completes the
/// work an agent's wallet paid for. Calls and proofs only; nothing here sends.
export const jobEscrowAbi = parseAbi([
  'struct JobTerms { uint32 reviewWindow; uint16 partialBps; uint16 fallbackBps; }',
  'struct BountyTerms { address evaluator; uint128 prize; uint64 entriesBy; uint64 awardBy; uint16[] shares; string description; }',
  'struct JobCore { uint8 status; bool bounty; bool disputed; uint64 expiredAt; uint64 submittedAt; uint64 rejectedAt; uint32 reviewWindow; uint16 partialBps; uint16 fallbackBps; address client; uint64 awardBy; address provider; uint32 entries; address evaluator; uint128 budget; bytes32 deliverable; bytes32 reason; string description; }',
  'function openBounty(BountyTerms t) returns (uint256)',
  'function enter(uint256 id, bytes32 deliverable)',
  'function award(uint256 id, address[] winners)',
  'function createJobWithTerms(address provider, address evaluator, uint256 expiredAt, string description, JobTerms t) returns (uint256)',
  'function setBudget(uint256 id, uint256 amount, bytes optParams)',
  'function fund(uint256 id, uint256 expectedBudget, bytes optParams)',
  'function submit(uint256 id, bytes32 deliverable, bytes optParams)',
  'function complete(uint256 id, bytes32 reason, bytes optParams)',
  'function reject(uint256 id, bytes32 reason, bytes optParams)',
  'function release(uint256 id)',
  'function claimRefund(uint256 id)',
  'function disputeRejection(uint256 id, bytes32 clauseHash)',
  'function confirmRejection(uint256 id)',
  'function jobOf(uint256 id) view returns (JobCore)',
  'function entryOf(uint256 id, address entrant) view returns (bytes32)',
  'function jobCount() view returns (uint256)',
  'event BountyOpened(uint256 indexed jobId, address indexed client, address indexed evaluator, uint256 prize, uint64 entriesBy, uint64 awardBy)',
  'event Entered(uint256 indexed jobId, address indexed entrant, bytes32 deliverable)',
  'event BountyAwarded(uint256 indexed jobId, address[] winners, uint256 paid)',
  'event JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 expiredAt, address hook)',
  'event JobFunded(uint256 indexed jobId, address indexed client, uint256 amount)',
  'event JobSubmitted(uint256 indexed jobId, address indexed provider, bytes32 deliverable)',
  'event JobCompleted(uint256 indexed jobId, address indexed evaluator, bytes32 reason)',
  'event JobRejected(uint256 indexed jobId, address indexed rejector, bytes32 reason)',
  'event PaymentReleased(uint256 indexed jobId, address indexed provider, uint256 amount)',
  'event Refunded(uint256 indexed jobId, address indexed client, uint256 amount)',
  'event Paid(bytes32 indexed dealId, address indexed to, uint256 amount, bool toAssignee)',
]);

const BPS = 10_000n;
/// Karwan's terms for an outside-agent job: 5 days to review, and half as the
/// partial ruling and the fallback, the contract's own defaults.
export const AGENT_JOB_TERMS = { reviewWindow: 5 * 86_400, partialBps: 5000, fallbackBps: 5000 } as const;

type Call = { to: Hex; data: Hex };
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const dealKey = (jobId: bigint) => `0x${jobId.toString(16).padStart(64, '0')}` as Hex;

/// What the payer puts in: the amount and half the fee on it, as the contract
/// counts it.
export const withHalfFee = (amount: bigint, feeBps: number) => amount + (amount * BigInt(feeBps)) / BPS / 2n;

/// The contract's own maths for an award: each place's share, less its half of
/// the fee, and what goes back to the buyer.
export function contestPayouts(prize: bigint, feeBps: number, shares: number[], winners: number) {
  const funded = withHalfFee(prize, feeBps);
  const gross: bigint[] = [];
  const net: bigint[] = [];
  let fee = 0n;
  for (let i = 0; i < winners; i += 1) {
    const g = (prize * BigInt(shares[i]!)) / BPS;
    const f = (g * BigInt(feeBps)) / BPS;
    gross.push(g);
    net.push(g - (f - f / 2n));
    fee += f;
  }
  const back = funded - net.reduce((a, b) => a + b, 0n) - fee;
  return { gross, net, fee, funded, back };
}

export function openBountyCalls(i: {
  jobs: Hex; usdc: Hex; prize: bigint; feeBps: number; evaluator: Hex;
  entriesBy: bigint; awardBy: bigint; shares: number[]; description: string;
}): Call[] {
  return [
    { to: i.usdc, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [i.jobs, withHalfFee(i.prize, i.feeBps)] }) },
    {
      to: i.jobs,
      data: encodeFunctionData({
        abi: jobEscrowAbi,
        functionName: 'openBounty',
        args: [{ evaluator: i.evaluator, prize: i.prize, entriesBy: i.entriesBy, awardBy: i.awardBy, shares: i.shares, description: i.description }],
      }),
    },
  ];
}

export const enterCall = (jobs: Hex, id: bigint, deliverable: Hex): Call => ({ to: jobs, data: encodeFunctionData({ abi: jobEscrowAbi, functionName: 'enter', args: [id, deliverable] }) });
export const awardCall = (jobs: Hex, id: bigint, winners: Hex[]): Call => ({ to: jobs, data: encodeFunctionData({ abi: jobEscrowAbi, functionName: 'award', args: [id, winners] }) });
/// Taking back a contest nobody entered, or rejecting a job's work.
export const rejectCall = (jobs: Hex, id: bigint, reason: Hex): Call => ({ to: jobs, data: encodeFunctionData({ abi: jobEscrowAbi, functionName: 'reject', args: [id, reason, '0x'] }) });
/// Returning a contest past its award date, or refunding a job nobody delivered.
export const refundCall = (jobs: Hex, id: bigint): Call => ({ to: jobs, data: encodeFunctionData({ abi: jobEscrowAbi, functionName: 'claimRefund', args: [id] }) });

export const createJobCall = (i: { jobs: Hex; provider: Hex; evaluator: Hex; expiredAt: bigint; description: string }): Call => ({
  to: i.jobs,
  data: encodeFunctionData({ abi: jobEscrowAbi, functionName: 'createJobWithTerms', args: [i.provider, i.evaluator, i.expiredAt, i.description, AGENT_JOB_TERMS] }),
});
export const setBudgetCall = (jobs: Hex, id: bigint, budget: bigint): Call => ({ to: jobs, data: encodeFunctionData({ abi: jobEscrowAbi, functionName: 'setBudget', args: [id, budget, '0x'] }) });
export function fundJobCalls(i: { jobs: Hex; usdc: Hex; jobId: bigint; budget: bigint; feeBps: number }): Call[] {
  return [
    { to: i.usdc, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [i.jobs, withHalfFee(i.budget, i.feeBps)] }) },
    { to: i.jobs, data: encodeFunctionData({ abi: jobEscrowAbi, functionName: 'fund', args: [i.jobId, i.budget, '0x'] }) },
  ];
}
export const submitCall = (jobs: Hex, id: bigint, deliverable: Hex): Call => ({ to: jobs, data: encodeFunctionData({ abi: jobEscrowAbi, functionName: 'submit', args: [id, deliverable, '0x'] }) });
export const completeCall = (jobs: Hex, id: bigint, reason: Hex): Call => ({ to: jobs, data: encodeFunctionData({ abi: jobEscrowAbi, functionName: 'complete', args: [id, reason, '0x'] }) });
export const releaseCall = (jobs: Hex, id: bigint): Call => ({ to: jobs, data: encodeFunctionData({ abi: jobEscrowAbi, functionName: 'release', args: [id] }) });
export const disputeRejectionCall = (jobs: Hex, id: bigint, clauseHash: Hex): Call => ({ to: jobs, data: encodeFunctionData({ abi: jobEscrowAbi, functionName: 'disputeRejection', args: [id, clauseHash] }) });
export const confirmRejectionCall = (jobs: Hex, id: bigint): Call => ({ to: jobs, data: encodeFunctionData({ abi: jobEscrowAbi, functionName: 'confirmRejection', args: [id] }) });

function ok(receipt: TransactionReceipt, what: string) {
  if (receipt.status !== 'success') throw new Error(`${what}: the transaction reverted`);
}
const events = (receipt: TransactionReceipt, jobs: Hex) =>
  parseEventLogs({ abi: jobEscrowAbi, logs: receipt.logs, strict: false }).filter((e) => same(e.address, jobs));

/// The contest number, when the receipt opened exactly this contest.
export function proveOpened(receipt: TransactionReceipt, i: { jobs: Hex; client: Hex; evaluator: Hex; prize: bigint; entriesBy: bigint; awardBy: bigint }): bigint {
  ok(receipt, 'the contest did not open');
  for (const e of events(receipt, i.jobs)) {
    if (e.eventName !== 'BountyOpened') continue;
    const a = e.args;
    if (same(a.client ?? '', i.client) && same(a.evaluator ?? '', i.evaluator) && a.prize === i.prize && a.entriesBy === i.entriesBy && a.awardBy === i.awardBy) {
      return a.jobId!;
    }
  }
  throw new Error('the receipt has no matching BountyOpened');
}

export function proveEntered(receipt: TransactionReceipt, i: { jobs: Hex; jobId: bigint; entrant: Hex; deliverable: Hex }): void {
  ok(receipt, 'the entry did not go in');
  const found = events(receipt, i.jobs).some(
    (e) => e.eventName === 'Entered' && e.args.jobId === i.jobId && same(e.args.entrant ?? '', i.entrant) && e.args.deliverable === i.deliverable,
  );
  if (!found) throw new Error('the receipt has no matching Entered');
}

/// Each winner paid their net, in place order.
export function proveAwarded(receipt: TransactionReceipt, i: { jobs: Hex; jobId: bigint; winners: Hex[]; net: bigint[] }): void {
  ok(receipt, 'the award did not go through');
  const paid = events(receipt, i.jobs).filter((e) => e.eventName === 'Paid' && e.args.dealId === dealKey(i.jobId));
  i.winners.forEach((w, n) => {
    const hit = paid.some((e) => e.eventName === 'Paid' && same(e.args.to ?? '', w) && e.args.amount === i.net[n]);
    if (!hit) throw new Error(`the receipt does not pay place ${n + 1} its share`);
  });
}

export function proveRefunded(receipt: TransactionReceipt, i: { jobs: Hex; jobId: bigint; client: Hex }): bigint {
  ok(receipt, 'the money did not go back');
  for (const e of events(receipt, i.jobs)) {
    if (e.eventName === 'Refunded' && e.args.jobId === i.jobId && same(e.args.client ?? '', i.client)) return e.args.amount!;
  }
  throw new Error('the receipt has no matching Refunded');
}

/// The job number, when the receipt created a job naming exactly these parties.
export function proveCreated(receipt: TransactionReceipt, i: { jobs: Hex; client: Hex; provider: Hex; evaluator: Hex }): bigint {
  ok(receipt, 'the job was not created');
  for (const e of events(receipt, i.jobs)) {
    if (e.eventName !== 'JobCreated') continue;
    const a = e.args;
    if (same(a.client ?? '', i.client) && same(a.provider ?? '', i.provider) && same(a.evaluator ?? '', i.evaluator)) return a.jobId!;
  }
  throw new Error('the receipt has no matching JobCreated');
}

export function proveFunded(receipt: TransactionReceipt, i: { jobs: Hex; jobId: bigint; client: Hex; budget: bigint }): void {
  ok(receipt, 'the job was not funded');
  const found = events(receipt, i.jobs).some(
    (e) => e.eventName === 'JobFunded' && e.args.jobId === i.jobId && same(e.args.client ?? '', i.client) && e.args.amount === i.budget,
  );
  if (!found) throw new Error('the receipt has no matching JobFunded');
}

export function proveSubmitted(receipt: TransactionReceipt, i: { jobs: Hex; jobId: bigint; provider: Hex; deliverable: Hex }): void {
  ok(receipt, 'the work was not submitted');
  const found = events(receipt, i.jobs).some(
    (e) => e.eventName === 'JobSubmitted' && e.args.jobId === i.jobId && same(e.args.provider ?? '', i.provider) && e.args.deliverable === i.deliverable,
  );
  if (!found) throw new Error('the receipt has no matching JobSubmitted');
}

/// What the provider was paid when the job completed.
export function proveCompleted(receipt: TransactionReceipt, i: { jobs: Hex; jobId: bigint; provider: Hex }): bigint {
  ok(receipt, 'the job did not complete');
  const evs = events(receipt, i.jobs);
  if (!evs.some((e) => e.eventName === 'JobCompleted' && e.args.jobId === i.jobId)) throw new Error('the receipt has no JobCompleted');
  for (const e of evs) {
    if (e.eventName === 'PaymentReleased' && e.args.jobId === i.jobId && same(e.args.provider ?? '', i.provider)) return e.args.amount!;
  }
  throw new Error('the receipt does not pay the provider');
}
