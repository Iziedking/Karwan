import { encodeAbiParameters, encodeFunctionData, erc20Abi, keccak256, parseAbi, parseEventLogs, type Hex, type TransactionReceipt } from 'viem';

/// KarwanTimeEscrow on the escrow family (view 32): hourly work billed by the
/// minute and monthly retainers, one funded week or month at a time. Calls,
/// money maths and proofs only; nothing here sends.
const TERMS =
  'struct TimeTerms { address asset; address worker; uint128 rate; uint32 unitScale; uint32 maxUnits; uint32 cycleSecs; uint16 cycles; uint64 startsAt; uint64 acceptBy; uint32 claimGrace; uint32 reviewWindow; uint8 noticeCycles; bool rollover; uint16 partialBps; uint16 fallbackBps; bytes32 agreementHash; }';

export const timeEscrowAbi = parseAbi([
  TERMS,
  'struct TimeEngagement { uint8 state; uint16 version; uint16 nextCycle; uint16 runs; uint16 open; bool ruled; address endAsked; uint16 endAskedIn; bytes32 termsHash; uint128 carry; uint128 paidGross; bytes32 amendHash; address amendBy; }',
  'struct TimeCycle { uint8 state; uint16 version; uint32 claimed; uint32 approved; uint32 disputed; uint64 claimedAt; uint128 funded; uint128 paidGross; bytes32 evidence; }',
  'function open(bytes32 salt, TimeTerms t) returns (bytes32)',
  'function accept(bytes32 id, bytes32 termsHash)',
  'function cancelOffer(bytes32 id)',
  'function fundCycle(bytes32 id)',
  'function submit(bytes32 id, uint16 k, uint32 units, bytes32 evidence)',
  'function approve(bytes32 id, uint16 k, uint32 units)',
  'function settle(bytes32 id, uint16 k)',
  'function object(bytes32 id, uint16 k, uint32 units, bytes32 clauseHash)',
  'function dropObjection(bytes32 id, uint16 k)',
  'function giveNotice(bytes32 id)',
  'function close(bytes32 id)',
  'function escalate(bytes32 id, uint16 k)',
  'function rule(bytes32 id, uint16 k, uint16 workerBps, bytes32 rulingHash)',
  'function applyFallback(bytes32 id, uint16 k)',
  'function dealIdFor(address employer, bytes32 salt) view returns (bytes32)',
  'function termsHashOf(TimeTerms t) pure returns (bytes32)',
  'function getEngagement(bytes32 id) view returns (TimeEngagement)',
  'function getCycle(bytes32 id, uint16 k) view returns (TimeCycle)',
  'function settleAtOf(bytes32 id, uint16 k) view returns (uint256)',
  'event EngagementOffered(bytes32 indexed id, address indexed employer, address indexed worker, bytes32 termsHash)',
  'event EngagementAccepted(bytes32 indexed id)',
  'event EngagementCancelled(bytes32 indexed id, uint256 refunded)',
  'event CycleFunded(bytes32 indexed id, uint16 indexed cycle, uint256 paid, uint256 fromCarry)',
  'event UnitsSubmitted(bytes32 indexed id, uint16 indexed cycle, uint32 units, bytes32 evidence)',
  'event UnitsApproved(bytes32 indexed id, uint16 indexed cycle, uint32 units)',
  'event UnitsObjected(bytes32 indexed id, uint16 indexed cycle, uint32 units)',
  'event CycleSettled(bytes32 indexed id, uint16 indexed cycle, uint256 gross, uint256 unused, bool carried)',
  'event NoticeGiven(bytes32 indexed id, address indexed by, uint16 runs)',
  'event EngagementClosed(bytes32 indexed id, uint256 paidGross, uint256 refunded)',
  'event DisputeEscalated(bytes32 indexed dealId, address indexed by, uint64 rulingDue)',
  'event DisputeResolved(bytes32 indexed dealId, uint16 sellerBps, bytes32 rulingHash, uint8 how)',
  'event Paid(bytes32 indexed dealId, address indexed to, uint256 amount, bool toAssignee)',
]);

export interface TimeTermsT {
  asset: Hex;
  worker: Hex;
  rate: bigint;
  unitScale: number;
  maxUnits: number;
  cycleSecs: number;
  cycles: number;
  startsAt: bigint;
  acceptBy: bigint;
  claimGrace: number;
  reviewWindow: number;
  noticeCycles: number;
  rollover: boolean;
  partialBps: number;
  fallbackBps: number;
  agreementHash: Hex;
}

export type WorkKind = 'hourly' | 'monthly';

const BPS = 10_000n;
const DAY = 86_400;
/// View 32, decisions 2 to 5 (29 Oct 2026): a week or a 30-day month, 2 days to
/// log, 3 to review, one period's notice, unused budget back each period.
export const WORK_TIMINGS = {
  hourly: { cycleSecs: 7 * DAY, unitScale: 60 },
  monthly: { cycleSecs: 30 * DAY, unitScale: 1 },
  claimGrace: 2 * DAY,
  reviewWindow: 3 * DAY,
  noticeCycles: 1,
  fallbackBps: 5000,
} as const;

export function buildTimeTerms(i: {
  kind: WorkKind; asset: Hex; worker: Hex; rateMicros: bigint; maxHours: number;
  periods: number; startsAt: bigint; agreementHash: Hex;
}): TimeTermsT {
  const k = WORK_TIMINGS[i.kind];
  return {
    asset: i.asset,
    worker: i.worker,
    rate: i.rateMicros,
    unitScale: k.unitScale,
    maxUnits: i.kind === 'hourly' ? i.maxHours * 60 : 1,
    cycleSecs: k.cycleSecs,
    cycles: i.periods,
    startsAt: i.startsAt,
    acceptBy: i.startsAt,
    claimGrace: WORK_TIMINGS.claimGrace,
    reviewWindow: WORK_TIMINGS.reviewWindow,
    noticeCycles: WORK_TIMINGS.noticeCycles,
    rollover: false,
    partialBps: 0,
    fallbackBps: WORK_TIMINGS.fallbackBps,
    agreementHash: i.agreementHash,
  };
}

const termsParam = [{
  type: 'tuple',
  components: [
    { name: 'asset', type: 'address' }, { name: 'worker', type: 'address' }, { name: 'rate', type: 'uint128' },
    { name: 'unitScale', type: 'uint32' }, { name: 'maxUnits', type: 'uint32' }, { name: 'cycleSecs', type: 'uint32' },
    { name: 'cycles', type: 'uint16' }, { name: 'startsAt', type: 'uint64' }, { name: 'acceptBy', type: 'uint64' },
    { name: 'claimGrace', type: 'uint32' }, { name: 'reviewWindow', type: 'uint32' }, { name: 'noticeCycles', type: 'uint8' },
    { name: 'rollover', type: 'bool' }, { name: 'partialBps', type: 'uint16' }, { name: 'fallbackBps', type: 'uint16' },
    { name: 'agreementHash', type: 'bytes32' },
  ],
}] as const;

/// The hash the worker accepts: keccak256(abi.encode(terms)), as termsHashOf.
export const timeTermsHash = (t: TimeTermsT): Hex => keccak256(encodeAbiParameters(termsParam, [t]));

/// The engagement id the contract derives: keccak256(abi.encode(chainid,
/// escrow, employer, salt)), as dealIdFor.
export const engagementIdFor = (i: { chainId: number; escrow: Hex; employer: Hex; salt: Hex }): Hex =>
  keccak256(encodeAbiParameters([{ type: 'uint256' }, { type: 'address' }, { type: 'address' }, { type: 'bytes32' }], [BigInt(i.chainId), i.escrow, i.employer, i.salt]));

export const grossOf = (t: Pick<TimeTermsT, 'rate' | 'unitScale'>, units: number | bigint): bigint =>
  (t.rate * BigInt(units)) / BigInt(t.unitScale);

/// What one funded week or month takes from the hirer: the most it can bill,
/// plus the hirer's half of the fee on that.
export function weekCost(t: Pick<TimeTermsT, 'rate' | 'unitScale' | 'maxUnits'>, feeBps: number) {
  const budget = grossOf(t, t.maxUnits);
  const feeHalf = (budget * BigInt(feeBps)) / BPS / 2n;
  return { budget, feeHalf, total: budget + feeHalf };
}

/// The contract's settle maths for `units` paid in total: the worker's net,
/// the fee, and what goes back to the hirer from what was funded.
export function payFor(t: Pick<TimeTermsT, 'rate' | 'unitScale'>, feeBps: number, units: number | bigint, funded: bigint) {
  const gross = grossOf(t, units);
  const fee = (gross * BigInt(feeBps)) / BPS;
  const net = gross - (fee - fee / 2n);
  const back = funded - gross - fee / 2n;
  return { gross, net, fee, back };
}

type Call = { to: Hex; data: Hex };
const at = (escrow: Hex, data: Hex): Call => ({ to: escrow, data });
const enc = (functionName: string, args: readonly unknown[]) =>
  encodeFunctionData({ abi: timeEscrowAbi, functionName: functionName as never, args: args as never });

/// Approve exactly week 1's total, then open, which funds week 1 in the same call.
export function offerCalls(i: { escrow: Hex; usdc: Hex; salt: Hex; terms: TimeTermsT; feeBps: number }): Call[] {
  return [
    at(i.usdc, encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [i.escrow, weekCost(i.terms, i.feeBps).total] })),
    at(i.escrow, enc('open', [i.salt, i.terms])),
  ];
}
export function fundCalls(i: { escrow: Hex; usdc: Hex; id: Hex; terms: TimeTermsT; feeBps: number }): Call[] {
  return [
    at(i.usdc, encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [i.escrow, weekCost(i.terms, i.feeBps).total] })),
    at(i.escrow, enc('fundCycle', [i.id])),
  ];
}
export const acceptCall = (escrow: Hex, id: Hex, termsHash: Hex) => at(escrow, enc('accept', [id, termsHash]));
export const cancelOfferCall = (escrow: Hex, id: Hex) => at(escrow, enc('cancelOffer', [id]));
export const submitCall = (escrow: Hex, id: Hex, k: number, units: number, evidence: Hex) => at(escrow, enc('submit', [id, k, units, evidence]));
export const approveCall = (escrow: Hex, id: Hex, k: number, units: number) => at(escrow, enc('approve', [id, k, units]));
export const objectCall = (escrow: Hex, id: Hex, k: number, units: number, clauseHash: Hex) => at(escrow, enc('object', [id, k, units, clauseHash]));
export const settleCall = (escrow: Hex, id: Hex, k: number) => at(escrow, enc('settle', [id, k]));
export const noticeCall = (escrow: Hex, id: Hex) => at(escrow, enc('giveNotice', [id]));
export const closeCall = (escrow: Hex, id: Hex) => at(escrow, enc('close', [id]));
export const escalateCall = (escrow: Hex, id: Hex, k: number) => at(escrow, enc('escalate', [id, k]));
export const applyFallbackCall = (escrow: Hex, id: Hex, k: number) => at(escrow, enc('applyFallback', [id, k]));
/// The review Safe's ruling on a week's objected hours, as calldata for the Safe.
export const ruleCalldata = (id: Hex, k: number, workerBps: number, rulingHash: Hex): Hex => enc('rule', [id, k, workerBps, rulingHash]);

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
function ok(receipt: TransactionReceipt, what: string) {
  if (receipt.status !== 'success') throw new Error(`${what}: the transaction reverted`);
}
const events = (receipt: TransactionReceipt, escrow: Hex) =>
  parseEventLogs({ abi: timeEscrowAbi, logs: receipt.logs, strict: false }).filter((e) => same(e.address, escrow));
type Ev = ReturnType<typeof events>[number];
function find(receipt: TransactionReceipt, escrow: Hex, name: Ev['eventName'], match: (args: Record<string, unknown>) => boolean): Record<string, unknown> {
  const hit = events(receipt, escrow).find((e) => e.eventName === name && match(e.args as Record<string, unknown>));
  if (!hit) throw new Error(`the receipt has no matching ${name}`);
  return hit.args as Record<string, unknown>;
}
/// What the receipt paid the worker on this engagement, after the fee.
const paidTo = (receipt: TransactionReceipt, escrow: Hex, id: Hex, worker: Hex) =>
  events(receipt, escrow)
    .filter((e) => e.eventName === 'Paid' && e.args.dealId === id && same(e.args.to ?? '', worker))
    .reduce((sum, e) => sum + ((e.args as { amount?: bigint }).amount ?? 0n), 0n);

/// The engagement id, when the receipt offered exactly these terms and funded week 1.
export function proveOffered(receipt: TransactionReceipt, i: { escrow: Hex; employer: Hex; worker: Hex; termsHash: Hex; total: bigint }): Hex {
  ok(receipt, 'the work was not offered');
  const a = find(receipt, i.escrow, 'EngagementOffered', (x) =>
    same(String(x.employer ?? ''), i.employer) && same(String(x.worker ?? ''), i.worker) && x.termsHash === i.termsHash);
  const id = a.id as Hex;
  find(receipt, i.escrow, 'CycleFunded', (x) => x.id === id && Number(x.cycle) === 0 && x.paid === i.total);
  return id;
}
export function proveAccepted(receipt: TransactionReceipt, i: { escrow: Hex; id: Hex }): void {
  ok(receipt, 'the work was not accepted');
  find(receipt, i.escrow, 'EngagementAccepted', (x) => x.id === i.id);
}
export function proveCancelled(receipt: TransactionReceipt, i: { escrow: Hex; id: Hex }): bigint {
  ok(receipt, 'the offer was not taken back');
  return find(receipt, i.escrow, 'EngagementCancelled', (x) => x.id === i.id).refunded as bigint;
}
export function proveFunded(receipt: TransactionReceipt, i: { escrow: Hex; id: Hex; k: number; total: bigint }): void {
  ok(receipt, 'the week was not paid for');
  find(receipt, i.escrow, 'CycleFunded', (x) => x.id === i.id && Number(x.cycle) === i.k && x.paid === i.total);
}
export function proveSubmitted(receipt: TransactionReceipt, i: { escrow: Hex; id: Hex; k: number; units: number; evidence: Hex }): void {
  ok(receipt, 'the hours were not logged');
  find(receipt, i.escrow, 'UnitsSubmitted', (x) => x.id === i.id && Number(x.cycle) === i.k && Number(x.units) === i.units && x.evidence === i.evidence);
}
/// What the worker received for the approval.
export function proveApproved(receipt: TransactionReceipt, i: { escrow: Hex; id: Hex; k: number; units: number; worker: Hex }): bigint {
  ok(receipt, 'the hours were not approved');
  find(receipt, i.escrow, 'UnitsApproved', (x) => x.id === i.id && Number(x.cycle) === i.k && Number(x.units) === i.units);
  return paidTo(receipt, i.escrow, i.id, i.worker);
}
/// What the worker received at once for the hours not objected to.
export function proveObjected(receipt: TransactionReceipt, i: { escrow: Hex; id: Hex; k: number; units: number; worker: Hex }): bigint {
  ok(receipt, 'the objection did not go in');
  find(receipt, i.escrow, 'UnitsObjected', (x) => x.id === i.id && Number(x.cycle) === i.k && Number(x.units) === i.units);
  return paidTo(receipt, i.escrow, i.id, i.worker);
}
/// The week's gross in total, what went back, and what this receipt paid the worker.
export function proveSettled(receipt: TransactionReceipt, i: { escrow: Hex; id: Hex; k: number; worker: Hex }) {
  ok(receipt, 'the week did not settle');
  const a = find(receipt, i.escrow, 'CycleSettled', (x) => x.id === i.id && Number(x.cycle) === i.k);
  return { gross: a.gross as bigint, back: a.unused as bigint, paidNow: paidTo(receipt, i.escrow, i.id, i.worker) };
}
export function proveNotice(receipt: TransactionReceipt, i: { escrow: Hex; id: Hex }): number {
  ok(receipt, 'the notice did not go in');
  return Number(find(receipt, i.escrow, 'NoticeGiven', (x) => x.id === i.id).runs);
}
export function proveClosed(receipt: TransactionReceipt, i: { escrow: Hex; id: Hex }) {
  ok(receipt, 'the work did not close');
  const a = find(receipt, i.escrow, 'EngagementClosed', (x) => x.id === i.id);
  return { paidGross: a.paidGross as bigint, refunded: a.refunded as bigint };
}
