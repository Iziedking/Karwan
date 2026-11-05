import { createHash, randomBytes } from 'node:crypto';
import { formatUnits, keccak256, parseUnits, toBytes, type Hex, type TransactionReceipt } from 'viem';
import type { AgentJob, AgentJobsStore } from '../db/agentJobs.js';
import {
  AGENT_JOB_TERMS, createJobCall, fundJobCalls, proveCreated, proveSubmitted, refundCall, setBudgetCall, withHalfFee,
} from '../chain/jobEscrow.js';

/// Outside-agent jobs on the job escrow (views 15 and 40). The outside agent's
/// wallet is the client, the seller's selling agent the provider, Karwan the
/// evaluator. The agent signs create, budget and fund itself from the calls
/// handed here; only the person it works for, proved by the World ID session
/// they made when pairing, can have Karwan complete or reject the work.

export interface AgentIdentity {
  agentAddress: string;
  humanKeyDigest: string;
}

/// The job as the escrow reports it. Status follows JobStatus: Open, Funded,
/// Submitted, Completed, Rejected, Expired.
export interface ChainJob {
  status: number;
  client: string;
  provider: string;
  evaluator: string;
  budget: bigint;
  expiredAt: bigint;
  submittedAt: bigint;
  rejectedAt: bigint;
  reviewWindow: number;
  disputed: boolean;
}

export const JOB = { Open: 0, Funded: 1, Submitted: 2, Completed: 3, Rejected: 4, Expired: 5 } as const;
/// JobLib.REJECT_WINDOW: the seller's time to take a rejection to a dispute.
export const REJECT_WINDOW_MS = 3 * 86_400_000;
export const PAIR_LINK_MS = 30 * 60_000;
const REMIND_BEFORE_MS = 86_400_000;
const MOST_DAYS = 60;

type Call = { to: Hex; data: Hex };
type SessionPurpose = 'enrol' | 'return';

export interface AgentJobsPorts {
  store: AgentJobsStore;
  jobs: Hex;
  usdc: Hex;
  evaluator: Hex;
  frontendBase: string;
  seller(tag: string): Promise<{ account: string; tag: string; provider: string | null; acceptsOutsideAgents: boolean } | null>;
  openingConfig(): Promise<{ open: boolean; feeBps: number; perDealCap: bigint }>;
  receipt(hash: Hex): Promise<TransactionReceipt | null>;
  readJob(id: bigint): Promise<ChainJob>;
  usdcBalance(address: string): Promise<bigint>;
  /// World ID 4.0 session proofs, keyed by the person behind the agent. Verify
  /// throws a WorldSessionError-like `{ code }` when the proof is not theirs.
  person: {
    request(key: string, purpose: SessionPurpose): Promise<unknown>;
    verify(key: string, purpose: SessionPurpose, result: Record<string, unknown>): Promise<void>;
    session(key: string): Promise<string | null>;
  };
  evaluatorCalls: { complete(id: bigint, reason: Hex): Promise<Hex>; reject(id: bigint, reason: Hex): Promise<Hex> };
  /// Steps anyone may send once a window has passed.
  anyoneCalls: { release(id: bigint): Promise<Hex>; confirmRejection(id: bigint): Promise<Hex> };
  sellerAgent: { submit(account: string, id: bigint, deliverable: Hex): Promise<Hex>; dispute(account: string, id: bigint, clause: Hex): Promise<Hex> };
  notify(account: string, event: { type: 'agent_job.funded' | 'agent_job.completed' | 'agent_job.rejected' | 'agent_job.refunded'; ref: string; work: string; amountUsdc: string }): Promise<void>;
  now?: () => number;
  token?: () => string;
}

export type Refusal = { ok: false; code: string; message: string; link?: string; needUsdc?: string };
const refuse = (code: string, message: string, extra: { link?: string; needUsdc?: string } = {}): Refusal => ({ ok: false, code, message, ...extra });
export const isRefusal = (x: unknown): x is Refusal => typeof x === 'object' && x !== null && (x as Refusal).ok === false;

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const usdc = (micros: bigint | string) => formatUnits(BigInt(micros), 6);
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
/// The World ID session key for the person behind an outside agent: not a
/// Karwan account, so it can never collide with one.
export const personKey = (humanKeyDigest: string) => `agent:${humanKeyDigest.toLowerCase()}`;

export interface JobView {
  ref: string;
  status: AgentJob['status'];
  seller: string;
  work: string;
  amountUsdc: string;
  totalUsdc: string;
  deadline: string;
  reviewEnds?: string;
  remindYourPerson?: boolean;
  next: string;
  calls?: Call[];
}

export function createAgentJobs(p: AgentJobsPorts) {
  const now = p.now ?? Date.now;
  const token = p.token ?? (() => randomBytes(32).toString('base64url'));
  const busy = new Set<string>();

  async function locked<T>(ref: string, fn: () => Promise<T>): Promise<T | Refusal> {
    if (busy.has(ref)) return refuse('BUSY', 'This deal is already being updated. Try again in a moment.');
    busy.add(ref);
    try {
      return await fn();
    } finally {
      busy.delete(ref);
    }
  }

  async function link(kind: 'pair' | 'release', subject: string, agentAddress: string, expiresAt: number) {
    const t = token();
    await p.store.putToken({ hash: hash(t), kind, subject, agentAddress: agentAddress.toLowerCase(), expiresAt });
    return `${p.frontendBase}/${kind === 'pair' ? 'pair' : 'agent-jobs/release'}/${t}`;
  }

  async function ownJob(identity: AgentIdentity, ref: string): Promise<AgentJob | Refusal> {
    const job = await p.store.job(ref);
    if (!job || job.humanKeyDigest !== identity.humanKeyDigest || !same(job.agentAddress, identity.agentAddress)) {
      return refuse('NOT_YOURS', 'No deal with that reference was opened by this agent.');
    }
    return job;
  }

  function view(job: AgentJob, next: string, calls?: Call[]): JobView {
    const total = withHalfFee(BigInt(job.amountMicros), job.feeBps);
    return {
      ref: job.ref, status: job.status, seller: `@${job.sellerTag}`, work: job.work,
      amountUsdc: usdc(job.amountMicros), totalUsdc: usdc(total), deadline: new Date(job.expiredAt).toISOString(),
      ...(job.reviewEndsAt ? { reviewEnds: new Date(job.reviewEndsAt).toISOString() } : {}),
      ...(job.remind ? { remindYourPerson: true } : {}),
      next, ...(calls ? { calls } : {}),
    };
  }

  /// Opens a deal with a Karwan seller. Until the person behind the agent has
  /// paired once with World ID, nothing is opened and the agent gets the link.
  async function open(identity: AgentIdentity, input: { seller: string; work: string; amountUsdc: number; deadlineDays: number }) {
    const pairing = await p.store.pairing(identity.humanKeyDigest);
    if (!pairing) {
      const pairLink = await link('pair', identity.humanKeyDigest, identity.agentAddress, now() + PAIR_LINK_MS);
      return refuse('NOT_PAIRED', 'The person you act for must verify once with World ID. Send them this link, then open the deal again.', { link: pairLink });
    }
    const work = input.work.trim();
    if (!work || work.length > 500) return refuse('BAD_WORK', 'Describe the work in 1 to 500 characters.');
    if (!Number.isInteger(input.deadlineDays) || input.deadlineDays < 1 || input.deadlineDays > MOST_DAYS) {
      return refuse('BAD_DEADLINE', `The deadline must be 1 to ${MOST_DAYS} days.`);
    }
    if (!(input.amountUsdc > 0)) return refuse('BAD_AMOUNT', 'The amount must be more than 0 USDC.');
    const amount = parseUnits(input.amountUsdc.toFixed(6), 6);
    const seller = await p.seller(input.seller.replace(/^@/, '').trim());
    if (!seller || !seller.provider) return refuse('NO_SELLER', 'No Karwan seller with that tag can take deals yet.');
    if (!seller.acceptsOutsideAgents) return refuse('SELLER_OFF', 'This seller does not take deals from agents outside Karwan.');
    if (same(seller.account, identity.agentAddress) || same(seller.provider, identity.agentAddress)) {
      return refuse('SELF', 'An agent cannot open a deal with itself.');
    }
    const cfg = await p.openingConfig();
    if (!cfg.open) return refuse('CLOSED', 'Deals on the job escrow are paused. Try again later.');
    const total = withHalfFee(amount, cfg.feeBps);
    if (cfg.perDealCap > 0n && total > cfg.perDealCap) {
      const most = (cfg.perDealCap * 20_000n) / (20_000n + BigInt(cfg.feeBps));
      return refuse('OVER_CAP', `The most one deal can be is ${usdc(most)} USDC of work.`);
    }
    const job: AgentJob = {
      ref: `aj_${randomBytes(8).toString('hex')}`, humanKeyDigest: identity.humanKeyDigest, agentAddress: identity.agentAddress.toLowerCase(),
      sellerAccount: seller.account.toLowerCase(), sellerTag: seller.tag, provider: seller.provider.toLowerCase(), work,
      amountMicros: amount.toString(), feeBps: cfg.feeBps, expiredAt: now() + input.deadlineDays * 86_400_000,
      status: 'quoted', tx: {}, createdAt: now(), updatedAt: now(),
    };
    await p.store.createJob(job);
    const call = createJobCall({ jobs: p.jobs, provider: job.provider as Hex, evaluator: p.evaluator, expiredAt: BigInt(Math.floor(job.expiredAt / 1000)), description: work });
    return {
      ok: true as const,
      quote: { workUsdc: usdc(amount), feeUsdc: usdc(total - amount), totalUsdc: usdc(total) },
      ...view(job, 'Send this call from your wallet, then call fund_deal with the transaction hash.', [call]),
    };
  }

  /// Reads the agent's create receipt back and hands it the budget and funding
  /// calls with exact amounts, or what its wallet still needs.
  async function fund(identity: AgentIdentity, ref: string, createTx: Hex) {
    const own = await ownJob(identity, ref);
    if (isRefusal(own)) return own;
    return locked(ref, async () => {
      let job = (await p.store.job(ref))!;
      if (job.status === 'quoted') {
        const receipt = await p.receipt(createTx);
        if (!receipt) return refuse('PENDING', 'That transaction is not on Arc yet. Try again in a few seconds.');
        let id: bigint;
        try {
          id = proveCreated(receipt, { jobs: p.jobs, client: job.agentAddress as Hex, provider: job.provider as Hex, evaluator: p.evaluator });
        } catch {
          return refuse('BAD_RECEIPT', 'That transaction did not create this deal: the wallet, seller or reviewer does not match.');
        }
        const chain = await p.readJob(id);
        if (chain.status !== JOB.Open || chain.expiredAt !== BigInt(Math.floor(job.expiredAt / 1000)) || chain.reviewWindow !== AGENT_JOB_TERMS.reviewWindow) {
          return refuse('BAD_RECEIPT', 'That job on Arc does not carry the terms Karwan quoted.');
        }
        if (await p.store.jobByChainId(id.toString())) return refuse('BAD_RECEIPT', 'That job is already another deal.');
        job = (await p.store.patchJob(ref, { status: 'created', chainId: id.toString(), tx: { create: createTx } }, ['quoted']))!;
      }
      if (job.status !== 'created') return refuse('WRONG_STATE', 'This deal is already funded.');
      const id = BigInt(job.chainId!);
      const budget = BigInt(job.amountMicros);
      const total = withHalfFee(budget, job.feeBps);
      const calls = [setBudgetCall(p.jobs, id, budget), ...fundJobCalls({ jobs: p.jobs, usdc: p.usdc, jobId: id, budget, feeBps: job.feeBps })];
      const balance = await p.usdcBalance(job.agentAddress);
      const short = balance < total ? total - balance : 0n;
      const next = short > 0n
        ? `Your wallet needs ${usdc(short)} more USDC on Arc before these calls. Then send them in order and call deal_status.`
        : 'Send these three calls in order from your wallet, then call deal_status.';
      return { ok: true as const, ...(short > 0n ? { needUsdc: usdc(short) } : {}), ...view(job, next, calls) };
    });
  }

  /// Reads the job back from Arc, moves the record on, and says what comes next.
  async function status(identity: AgentIdentity, ref: string) {
    const own = await ownJob(identity, ref);
    if (isRefusal(own)) return own;
    let job = await sync(own);
    if (job.status === 'quoted') return { ok: true as const, ...view(job, 'Send the create call, then call fund_deal with its hash.') };
    if (job.status === 'created') return { ok: true as const, ...view(job, 'Call fund_deal for the budget and funding calls.') };
    if (job.status === 'funded' && now() >= job.expiredAt) {
      return { ok: true as const, ...view(job, 'The seller missed the deadline. Send this call to get the money back.', [refundCall(p.jobs, BigInt(job.chainId!))]) };
    }
    const next: Record<AgentJob['status'], string> = {
      quoted: '', created: '',
      funded: 'Funded. The seller is working on it.',
      submitted: 'The work is delivered. Call request_release and send your person the link. Silence pays the seller when the review ends.',
      completed: 'Done. The seller was paid.',
      rejected: 'Your person was not happy. The seller has 3 days to take it to a dispute; otherwise the money comes back to your wallet.',
      disputed: 'The seller disputed. A Karwan reviewer rules, and the share they decide is paid.',
      refunded: 'The money is back in your wallet.',
      expired: 'The money is back in your wallet.',
    };
    job = (await p.store.job(ref))!;
    return { ok: true as const, ...view(job, next[job.status]) };
  }

  async function sync(job: AgentJob): Promise<AgentJob> {
    if (!job.chainId) return job;
    const chain = await p.readJob(BigInt(job.chainId));
    const patch: Partial<AgentJob> = {};
    if (chain.status === JOB.Funded && job.status === 'created') patch.status = 'funded';
    if (chain.status === JOB.Submitted && (job.status === 'created' || job.status === 'funded')) {
      Object.assign(patch, { status: 'submitted', submittedAt: Number(chain.submittedAt) * 1000, reviewEndsAt: (Number(chain.submittedAt) + chain.reviewWindow) * 1000 });
    }
    if (chain.status === JOB.Submitted && chain.rejectedAt > 0n && job.status === 'submitted') Object.assign(patch, { status: 'rejected', rejectedAt: Number(chain.rejectedAt) * 1000 });
    if (chain.disputed && job.status === 'rejected') patch.status = 'disputed';
    if (chain.status === JOB.Completed && job.status !== 'completed') patch.status = 'completed';
    if ((chain.status === JOB.Rejected || chain.status === JOB.Expired) && job.status !== 'refunded' && job.status !== 'expired') {
      patch.status = chain.status === JOB.Expired ? 'expired' : 'refunded';
    }
    if (!patch.status) return job;
    const next = (await p.store.patchJob(job.ref, patch, [job.status])) ?? job;
    if (patch.status === 'funded') await p.notify(next.sellerAccount, { type: 'agent_job.funded', ref: next.ref, work: next.work, amountUsdc: usdc(next.amountMicros) });
    if (patch.status === 'completed') await p.notify(next.sellerAccount, { type: 'agent_job.completed', ref: next.ref, work: next.work, amountUsdc: usdc(next.amountMicros) });
    return next;
  }

  /// A one-time link for the person: are they happy with the work? The agent
  /// cannot answer it.
  async function requestRelease(identity: AgentIdentity, ref: string) {
    const own = await ownJob(identity, ref);
    if (isRefusal(own)) return own;
    const job = await sync(own);
    if (job.status !== 'submitted') return refuse('WRONG_STATE', 'The seller has not delivered yet, or the deal has moved on.');
    const releaseLink = await link('release', job.ref, job.agentAddress, job.reviewEndsAt!);
    return { ok: true as const, link: releaseLink, ...view(job, 'Send this link to your person. Only they can answer it.') };
  }

  async function tokenJob(t: string) {
    const tk = await p.store.peekToken(hash(t), 'release', now());
    if (!tk) return refuse('TOKEN_USED', 'This link has been used or has expired.');
    const job = await p.store.job(tk.subject);
    if (!job) return refuse('TOKEN_USED', 'This link has been used or has expired.');
    return job;
  }

  async function releaseView(t: string) {
    const job = await tokenJob(t);
    if (isRefusal(job)) return job;
    return { ok: true as const, seller: `@${job.sellerTag}`, work: job.work, amountUsdc: usdc(job.amountMicros), deliveryNote: job.deliveryNote ?? '', reviewEnds: job.reviewEndsAt };
  }

  async function releaseCheck(t: string) {
    const job = await tokenJob(t);
    if (isRefusal(job)) return job;
    return { ok: true as const, request: await p.person.request(personKey(job.humanKeyDigest), 'return') };
  }

  /// The person's answer, proved with the World ID session they paired with.
  async function answer(t: string, proof: Record<string, unknown>, choice: { happy: boolean; note?: string }) {
    const pending = await tokenJob(t);
    if (isRefusal(pending)) return pending;
    const note = choice.note?.trim() ?? '';
    if (!choice.happy && (!note || note.length > 300)) return refuse('BAD_NOTE', 'Say in one line, up to 300 characters, what is wrong.');
    try {
      await p.person.verify(personKey(pending.humanKeyDigest), 'return', proof);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'WORLD_ID_SESSION_MISMATCH') return refuse('WRONG_PERSON', 'Only the person who paired with this agent can answer.');
      return refuse(code ?? 'WORLD_ID_FAILED', e instanceof Error ? e.message : 'World ID could not confirm this check.');
    }
    return locked(pending.ref, async () => {
      const job = await sync((await p.store.job(pending.ref))!);
      if (job.status !== 'submitted') return refuse('WRONG_STATE', 'This deal has already moved on.');
      if (!(await p.store.takeToken(hash(t), 'release', now()))) return refuse('TOKEN_USED', 'This link has been used or has expired.');
      const id = BigInt(job.chainId!);
      if (choice.happy) {
        const tx = await p.evaluatorCalls.complete(id, keccak256(toBytes('happy')));
        const done = await p.store.patchJob(job.ref, { status: 'completed', tx: { complete: tx } }, ['submitted']);
        await p.notify(job.sellerAccount, { type: 'agent_job.completed', ref: job.ref, work: job.work, amountUsdc: usdc(job.amountMicros) });
        return { ok: true as const, status: done?.status ?? 'completed' };
      }
      const tx = await p.evaluatorCalls.reject(id, keccak256(toBytes(note)));
      const done = await p.store.patchJob(job.ref, { status: 'rejected', rejectedAt: now(), unhappyNote: note, tx: { reject: tx } }, ['submitted']);
      await p.notify(job.sellerAccount, { type: 'agent_job.rejected', ref: job.ref, work: job.work, amountUsdc: usdc(job.amountMicros) });
      return { ok: true as const, status: done?.status ?? 'rejected' };
    });
  }

  async function pairView(t: string) {
    const tk = await p.store.peekToken(hash(t), 'pair', now());
    if (!tk) return refuse('TOKEN_USED', 'This link has been used or has expired. Ask your agent for a new one.');
    return { ok: true as const, request: await p.person.request(personKey(tk.subject), (await p.person.session(personKey(tk.subject))) ? 'return' : 'enrol') };
  }

  /// The person verifies once; their World ID session is then tied to the
  /// human behind the agent.
  async function pair(t: string, proof: Record<string, unknown>) {
    const tk = await p.store.peekToken(hash(t), 'pair', now());
    if (!tk) return refuse('TOKEN_USED', 'This link has been used or has expired. Ask your agent for a new one.');
    const key = personKey(tk.subject);
    try {
      await p.person.verify(key, (await p.person.session(key)) ? 'return' : 'enrol', proof);
    } catch (e) {
      return refuse((e as { code?: string }).code ?? 'WORLD_ID_FAILED', e instanceof Error ? e.message : 'World ID could not confirm this check.');
    }
    const session = await p.person.session(key);
    if (!session || !(await p.store.takeToken(hash(t), 'pair', now()))) return refuse('TOKEN_USED', 'This link has been used or has expired.');
    if (!(await p.store.savePairing({ humanKeyDigest: tk.subject, worldSessionId: session, agentAddress: tk.agentAddress, pairedAt: now() }))) {
      return refuse('PAIRED_ELSEWHERE', 'This World ID is already paired with another agent owner.');
    }
    return { ok: true as const };
  }

  async function sellerJob(account: string, ref: string): Promise<AgentJob | Refusal> {
    const job = await p.store.job(ref);
    if (!job || !same(job.sellerAccount, account)) return refuse('NOT_YOURS', 'No deal with that reference is yours.');
    return sync(job);
  }

  /// The seller marks the work delivered; their selling agent submits it.
  async function markDelivered(account: string, ref: string, note: string) {
    const own = await sellerJob(account, ref);
    if (isRefusal(own)) return own;
    const text = note.trim();
    if (!text || text.length > 1000) return refuse('BAD_NOTE', 'Say what you delivered, up to 1,000 characters.');
    return locked(ref, async () => {
      const job = (await p.store.job(ref))!;
      if (job.status !== 'funded') return refuse('WRONG_STATE', job.status === 'created' || job.status === 'quoted' ? 'The deal is not funded yet.' : 'This deal has already moved on.');
      if (now() >= job.expiredAt) return refuse('LATE', 'The deadline has passed, so the money goes back to the buyer.');
      const id = BigInt(job.chainId!);
      const deliverable = keccak256(toBytes(text));
      const tx = await p.sellerAgent.submit(job.sellerAccount, id, deliverable);
      const receipt = await p.receipt(tx);
      if (!receipt) return refuse('PENDING', 'Your delivery is on its way to Arc. Check again in a moment.');
      proveSubmitted(receipt, { jobs: p.jobs, jobId: id, provider: job.provider as Hex, deliverable });
      const chain = await p.readJob(id);
      const done = await p.store.patchJob(ref, {
        status: 'submitted', deliveryNote: text, submittedAt: Number(chain.submittedAt) * 1000,
        reviewEndsAt: (Number(chain.submittedAt) + chain.reviewWindow) * 1000, tx: { submit: tx },
      }, ['funded']);
      return { ok: true as const, job: sellerView(done!) };
    });
  }

  /// The seller takes the person's rejection to the shared dispute path.
  async function sellerDispute(account: string, ref: string, clause: string) {
    const own = await sellerJob(account, ref);
    if (isRefusal(own)) return own;
    if (own.status !== 'rejected') return refuse('WRONG_STATE', 'Only a rejected delivery can be disputed.');
    if (now() >= (own.rejectedAt ?? 0) + REJECT_WINDOW_MS) return refuse('LATE', 'The 3 days to dispute have passed.');
    const text = clause.trim();
    if (!text || text.length > 1000) return refuse('BAD_NOTE', 'Say why the work meets what was agreed, up to 1,000 characters.');
    return locked(ref, async () => {
      const tx = await p.sellerAgent.dispute(own.sellerAccount, BigInt(own.chainId!), keccak256(toBytes(text)));
      const done = await p.store.patchJob(ref, { status: 'disputed', tx: { dispute: tx } }, ['rejected']);
      return { ok: true as const, job: sellerView(done!) };
    });
  }

  function sellerView(job: AgentJob) {
    return {
      ref: job.ref, status: job.status, work: job.work, amountUsdc: usdc(job.amountMicros), deadline: job.expiredAt,
      reviewEndsAt: job.reviewEndsAt ?? null, rejectedAt: job.rejectedAt ?? null, unhappyNote: job.unhappyNote ?? null,
      disputeBy: job.rejectedAt ? job.rejectedAt + REJECT_WINDOW_MS : null,
    };
  }

  async function sellerJobs(account: string) {
    return (await p.store.jobsForSeller(account)).filter((j) => j.status !== 'quoted').map(sellerView);
  }

  async function sellerJobView(account: string, ref: string) {
    const job = await sellerJob(account, ref);
    if (isRefusal(job)) return job;
    return { ok: true as const, job: sellerView(job) };
  }

  /// One pass of the runner: pays out reviews that ended in silence, returns
  /// money for rejections nobody disputed, and flags reminders. Every job is
  /// re-read on chain under the same lock the person's answer takes.
  async function tick() {
    const done: Array<{ ref: string; step: string }> = [];
    for (const listed of await p.store.jobsWithStatus(['created', 'funded', 'submitted', 'rejected'])) {
      // One job failing on chain leaves it for the next pass, never the rest.
      const r = await locked(listed.ref, async () => {
        const job = await sync((await p.store.job(listed.ref))!);
        if (!job.chainId) return null;
        const id = BigInt(job.chainId);
        const t = now();
        if (job.status === 'submitted' && job.reviewEndsAt) {
          if (t >= job.reviewEndsAt) {
            const tx = await p.anyoneCalls.release(id);
            await p.store.patchJob(job.ref, { status: 'completed', tx: { release: tx } }, ['submitted']);
            await p.notify(job.sellerAccount, { type: 'agent_job.completed', ref: job.ref, work: job.work, amountUsdc: usdc(job.amountMicros) });
            return 'release';
          }
          if (!job.remind && t >= job.reviewEndsAt - REMIND_BEFORE_MS) {
            await p.store.patchJob(job.ref, { remind: true });
            return 'remind';
          }
        }
        if (job.status === 'rejected' && job.rejectedAt && t >= job.rejectedAt + REJECT_WINDOW_MS) {
          const tx = await p.anyoneCalls.confirmRejection(id);
          await p.store.patchJob(job.ref, { status: 'refunded', tx: { refund: tx } }, ['rejected']);
          return 'confirmRejection';
        }
        return null;
      }).catch(() => 'failed' as const);
      if (typeof r === 'string') done.push({ ref: listed.ref, step: r });
    }
    return done;
  }

  return {
    open, fund, status, requestRelease, releaseView, releaseCheck, answer, pairView, pair,
    markDelivered, sellerDispute, sellerJobs, sellerJobView, tick,
  };
}

export type AgentJobs = ReturnType<typeof createAgentJobs>;
