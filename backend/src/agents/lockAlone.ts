import { lockFailed, lockWorked, stopAgent, type AgentRecord, type StopReason } from './agentRecord.js';
import { afterRefusal, mayLock, type LockRefusal } from './autopilotGate.js';
import { lockFacts } from './lockFacts.js';
import { released, reserved, settled } from './lockLedger.js';

/// The buying agent locks the money for a deal it agreed, without its person's
/// tap (view 87, step 3). It adds no way to fund: it stands in front of the
/// path a tap takes and runs the same checks in the same order. The gate
/// decides in code, the amount is set aside before anything is funded, and the
/// step is written down so a restart finishes it once. Anything but a yes
/// becomes a question to the person, or stops the agent.

export interface LockPick {
  owner: string;
  seller: string;
  priceUsdc: string;
  /// Where the seller's price opened, when it moved.
  openedAtUsdc?: string;
}

/// The step as written before the money moves. It carries what the note needs,
/// so a restart can finish it without the request's live state.
export interface LockStep { owner: string; seller: string; priceUsdc: string; totalUsdc: string; openedAtUsdc?: string; at: number; state: 'started' | 'done' }

export type AskReason = Extract<LockRefusal, 'over-deal' | 'over-week' | 'who' | 'price-outlier' | 'not-family'> | 'world-id' | 'unverified' | 'short' | 'failed';

export type LockOutcome =
  | { kind: 'locked'; txHash: string }
  | { kind: 'asked'; reason: AskReason }
  | { kind: 'stopped'; reason: StopReason }
  | { kind: 'waiting-seller' }
  | { kind: 'skipped'; why: string };

export type LockNews =
  | { type: 'agent.locked'; owner: string; jobId: string; seller: string; priceUsdc: string; totalUsdc: string; openedAtUsdc?: string; txHash: string }
  | { type: 'agent.stopped'; owner: string; reason: StopReason };

export interface LockDeps {
  serverOn(): boolean;
  /// The escrow family is switched on for this network.
  familyOpen(): boolean;
  /// The seller the agent agreed with on a request that has Agree for me, or
  /// null when there is nothing to lock.
  pick(jobId: string): Promise<LockPick | null>;
  step(jobId: string): Promise<LockStep | null>;
  writeStep(jobId: string, step: LockStep): Promise<void>;
  funded(jobId: string): Promise<boolean>;
  person(owner: string): Promise<{ agentOn: boolean; lock: boolean; timeZone: string }>;
  /// This request would fund on the escrow family.
  family(jobId: string): Promise<boolean>;
  /// The price plus the buyer's deal fee.
  totalUsdc(priceUsdc: string): Promise<string>;
  /// What the person has to add before the deal can be funded, or null.
  shortBy(pick: LockPick, totalUsdc: string): Promise<string | null>;
  seller(sellerAgent: string): Promise<{ verified: boolean; settledDeals: number; upheldDisputes: number }>;
  marketUsdc(jobId: string): Promise<number | null>;
  outlierPct: number;
  reserve(owner: string, decide: (r: AgentRecord) => { ok: true; record: AgentRecord } | { ok: false }): Promise<{ ok: boolean; record: AgentRecord }>;
  update(owner: string, change: (r: AgentRecord) => AgentRecord): Promise<AgentRecord>;
  /// The shortlist lets this seller be chosen with nothing for a person to acknowledge.
  shortlistOk(jobId: string, seller: string): Promise<boolean>;
  worldStep(jobId: string, pick: LockPick): Promise<'proceed' | 'buyer' | 'seller'>;
  sellerAnswer(jobId: string, pick: LockPick): Promise<'go' | 'wait' | 'declined'>;
  fund(jobId: string, seller: string, priceUsdc: string): Promise<{ ok: true; txHash: string } | { ok: false; code: string; message: string }>;
  ask(input: { pick: LockPick; jobId: string; reason: AskReason; totalUsdc: string; addUsdc?: string }): Promise<void>;
  tell(news: LockNews): void;
}

/// Refusals that mean the person never asked for this: nothing is said.
const QUIET: readonly LockRefusal[] = ['server-off', 'agent-off', 'switch-off', 'stopped'];

const samePick = (step: LockStep, pick: LockPick) => step.seller.toLowerCase() === pick.seller.toLowerCase() && step.priceUsdc === pick.priceUsdc;

export async function lockAlone(deps: LockDeps, jobId: string, now: number, opts: { sellerSaidYes?: boolean } = {}): Promise<LockOutcome> {
  if (!deps.serverOn()) return { kind: 'skipped', why: 'server-off' };
  const step = await deps.step(jobId);
  if (step?.state === 'done') return { kind: 'skipped', why: 'done' };

  const finish = async (txHash: string, done: LockStep): Promise<LockOutcome> => {
    await deps.writeStep(jobId, { ...done, state: 'done' });
    await deps.update(done.owner, (r) => lockWorked(settled(r, jobId)));
    deps.tell({ type: 'agent.locked', owner: done.owner, jobId, seller: done.seller, priceUsdc: done.priceUsdc, totalUsdc: done.totalUsdc, ...(done.openedAtUsdc ? { openedAtUsdc: done.openedAtUsdc } : {}), txHash });
    return { kind: 'locked', txHash };
  };

  const funded = await deps.funded(jobId);
  // A step that was written and then funded before a restart: finish it once.
  if (funded && step?.state === 'started') return finish('', step);
  if (funded) return { kind: 'skipped', why: 'funded' };
  const pick = await deps.pick(jobId);
  if (!pick) return { kind: 'skipped', why: 'no-pick' };
  const total = await deps.totalUsdc(pick.priceUsdc);

  const [person, family, seller, market] = await Promise.all([deps.person(pick.owner), deps.family(jobId), deps.seller(pick.seller), deps.marketUsdc(jobId)]);
  let refusal: LockRefusal | null = null;
  const held = await deps.reserve(pick.owner, (r) => {
    const decision = mayLock(lockFacts({
      serverOn: true,
      agentOn: person.agentOn,
      lock: person.lock,
      stopped: !!r.stopped,
      family,
      rules: r.lock ?? null,
      totalUsdc: total,
      agreedUsdc: pick.priceUsdc,
      marketUsdc: market,
      outlierPct: deps.outlierPct,
      timeZone: person.timeZone,
      seller,
      jobId,
      now,
    }));
    if (!decision.ok) {
      refusal = decision.reason;
      return { ok: false };
    }
    return { ok: true, record: reserved(r, { at: now, usdc: Number(total), jobId }) };
  });
  if (!held.ok) {
    const reason = (refusal ?? 'switch-off') as LockRefusal;
    if (QUIET.includes(reason)) return { kind: 'skipped', why: reason };
    if (afterRefusal(reason, deps.familyOpen()) === 'stop') return stop(deps, pick.owner, reason === 'over-day' ? 'locks-today' : 'not-family', now);
    await deps.ask({ pick, jobId, reason: reason as AskReason, totalUsdc: total });
    return { kind: 'asked', reason: reason as AskReason };
  }

  const giveBack = () => deps.update(pick.owner, (r) => released(r, jobId));
  const askAfterRelease = async (reason: AskReason, addUsdc?: string): Promise<LockOutcome> => {
    await giveBack();
    await deps.ask({ pick, jobId, reason, totalUsdc: total, ...(addUsdc ? { addUsdc } : {}) });
    return { kind: 'asked', reason };
  };

  if (!(await deps.shortlistOk(jobId, pick.seller))) return askAfterRelease('unverified');
  const world = await deps.worldStep(jobId, pick);
  if (world === 'buyer') return askAfterRelease('world-id');
  if (world === 'seller') return { kind: 'waiting-seller' };
  if (!opts.sellerSaidYes) {
    const answer = await deps.sellerAnswer(jobId, pick);
    if (answer === 'wait') return { kind: 'waiting-seller' };
    if (answer === 'declined') {
      await giveBack();
      return { kind: 'skipped', why: 'seller-declined' };
    }
  }
  const add = await deps.shortBy(pick, total);
  if (add) return askAfterRelease('short', add);

  const started: LockStep = step && samePick(step, pick)
    ? step
    : { owner: pick.owner, seller: pick.seller, priceUsdc: pick.priceUsdc, totalUsdc: total, ...(pick.openedAtUsdc ? { openedAtUsdc: pick.openedAtUsdc } : {}), at: now, state: 'started' };
  await deps.writeStep(jobId, started);
  const res = await deps.fund(jobId, pick.seller, pick.priceUsdc);
  if (res.ok) return finish(res.txHash, started);
  if (res.code === 'ALREADY_APPROVED' || res.code === 'ALREADY_FUNDED') return finish('', started);

  const after = await deps.update(pick.owner, (r) => lockFailed(released(r, jobId), now));
  if (after.stopped) {
    deps.tell({ type: 'agent.stopped', owner: pick.owner, reason: after.stopped.reason });
    return { kind: 'stopped', reason: after.stopped.reason };
  }
  await deps.ask({ pick, jobId, reason: 'failed', totalUsdc: total });
  return { kind: 'asked', reason: 'failed' };
}

async function stop(deps: LockDeps, owner: string, reason: StopReason, now: number): Promise<LockOutcome> {
  let told = false;
  await deps.update(owner, (r) => {
    told = !r.stopped;
    return stopAgent(r, reason, now);
  });
  // An agent already stopped was told when it stopped.
  if (told) deps.tell({ type: 'agent.stopped', owner, reason });
  return { kind: 'stopped', reason };
}
