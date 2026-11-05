import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, erc20Abi, getAddress, keccak256, toBytes, type Hex, type Log, type TransactionReceipt } from 'viem';
import { memoryAgentJobsStore } from '../db/agentJobs.js';
import { AGENT_JOB_TERMS, jobEscrowAbi } from '../chain/jobEscrow.js';
import { createAgentJobs, isRefusal, JOB, personKey, REJECT_WINDOW_MS, type AgentJobsPorts, type ChainJob } from './agentJobs.js';

/// Outside-agent jobs (views 15 and 40): the agent's wallet pays in, only the
/// paired person releases.

const JOBS: Hex = getAddress('0xea06b70c0808c2ad9b6316758407284fdad9d550');
const USDC: Hex = getAddress('0x3600000000000000000000000000000000000000');
const EVALUATOR: Hex = getAddress('0x00000000000000000000000000000000000000e1');
const AGENT: Hex = getAddress('0x1111111111111111111111111111111111111111');
const PROVIDER: Hex = getAddress('0x2222222222222222222222222222222222222222');
const SELLER = '0x3333333333333333333333333333333333333333';
const ME = { agentAddress: AGENT, humanKeyDigest: 'human-1' };
const DAY = 86_400_000;

function receipt(logs: Array<{ eventName: string; args: Record<string, unknown> }>): TransactionReceipt {
  return {
    status: 'success',
    logs: logs.map((l) => {
      const ev = (jobEscrowAbi as unknown as Array<{ type: string; name: string; inputs: Array<{ name: string; type: string; indexed?: boolean }> }>).find((x) => x.type === 'event' && x.name === l.eventName)!;
      const topics = encodeEventTopics({ abi: jobEscrowAbi, eventName: l.eventName as never, args: l.args as never });
      const plain = ev.inputs.filter((i) => !i.indexed);
      return { address: JOBS, topics, data: encodeAbiParameters(plain as never, plain.map((i) => l.args[i.name]) as never) } as unknown as Log;
    }),
  } as unknown as TransactionReceipt;
}

function world() {
  let t = 1_800_000_000_000;
  let n = 0;
  const receipts = new Map<string, TransactionReceipt>();
  const chain = new Map<bigint, ChainJob>();
  const sessions = new Map<string, string>();
  const sent: string[] = [];
  const told: string[] = [];
  let off = false;
  let balance = 1_000_000_000n;
  const ports: AgentJobsPorts = {
    store: memoryAgentJobsStore(), jobs: JOBS, usdc: USDC, evaluator: EVALUATOR, frontendBase: 'https://karwan.site',
    seller: async (tag) => (tag === 'ada' ? { account: SELLER, tag: 'ada', provider: PROVIDER, acceptsOutsideAgents: !off } : null),
    openingConfig: async () => ({ open: true, feeBps: 100, perDealCap: 1_005_000_000n }),
    receipt: async (h) => receipts.get(h) ?? null,
    readJob: async (id) => chain.get(id)!,
    usdcBalance: async () => balance,
    person: {
      request: async (key, purpose) => ({ key, purpose }),
      async verify(key, purpose, result) {
        const session = String(result.session);
        if (purpose === 'enrol') {
          sessions.set(key, session);
          return;
        }
        if (sessions.get(key) !== session) throw Object.assign(new Error('mismatch'), { code: 'WORLD_ID_SESSION_MISMATCH' });
      },
      session: async (key) => sessions.get(key) ?? null,
    },
    evaluatorCalls: {
      async complete(id) {
        sent.push(`complete:${id}`);
        chain.get(id)!.status = JOB.Completed;
        return '0xc0';
      },
      async reject(id) {
        sent.push(`reject:${id}`);
        chain.get(id)!.rejectedAt = BigInt(Math.floor(t / 1000));
        return '0xr0';
      },
    },
    anyoneCalls: {
      async release(id) {
        sent.push(`release:${id}`);
        chain.get(id)!.status = JOB.Completed;
        return '0xa0';
      },
      async confirmRejection(id) {
        sent.push(`confirmRejection:${id}`);
        chain.get(id)!.status = JOB.Rejected;
        return '0xb0';
      },
    },
    sellerAgent: {
      async submit(_account, id, deliverable) {
        const j = chain.get(id)!;
        j.status = JOB.Submitted;
        j.submittedAt = BigInt(Math.floor(t / 1000));
        receipts.set('0x5b', receipt([{ eventName: 'JobSubmitted', args: { jobId: id, provider: PROVIDER, deliverable } }]));
        return '0x5b';
      },
      async dispute(_a, id) {
        chain.get(id)!.disputed = true;
        return '0xd0';
      },
    },
    notify: async (_account, e) => {
      told.push(e.type);
    },
    now: () => t,
    token: () => `tok${(n += 1)}`,
  };
  const core = createAgentJobs(ports);
  return {
    core, ports, chain, sent, told,
    advance: (ms: number) => (t += ms),
    switchOff: () => (off = true),
    setBalance: (b: bigint) => (balance = b),
    /// The agent sends the create call Karwan handed it.
    created(id: bigint, expiredAtMs: number, over: Partial<{ provider: Hex; evaluator: Hex; client: Hex }> = {}) {
      const r = receipt([{ eventName: 'JobCreated', args: { jobId: id, client: over.client ?? AGENT, provider: over.provider ?? PROVIDER, evaluator: over.evaluator ?? EVALUATOR, expiredAt: BigInt(Math.floor(expiredAtMs / 1000)), hook: '0x0000000000000000000000000000000000000000' } }]);
      const hash = `0x${id.toString(16)}aa` as Hex;
      receipts.set(hash, r);
      chain.set(id, {
        status: JOB.Open, client: over.client ?? AGENT, provider: over.provider ?? PROVIDER, evaluator: over.evaluator ?? EVALUATOR, budget: 0n,
        expiredAt: BigInt(Math.floor(expiredAtMs / 1000)), submittedAt: 0n, rejectedAt: 0n, reviewWindow: AGENT_JOB_TERMS.reviewWindow, disputed: false,
      });
      return hash;
    },
    async pairMe(session = 'session_a') {
      const r = await core.open(ME, { seller: 'ada', work: 'Logo', amountUsdc: 100, deadlineDays: 7 });
      assert.ok(isRefusal(r) && r.code === 'NOT_PAIRED');
      const token = r.link!.split('/pair/')[1]!;
      const paired = await core.pair(token, { session });
      assert.deepEqual(paired, { ok: true });
    },
  };
}

async function fundedJob(w: ReturnType<typeof world>) {
  await w.pairMe();
  const opened = await w.core.open(ME, { seller: '@ada', work: 'Logo', amountUsdc: 100, deadlineDays: 7 });
  assert.ok(!isRefusal(opened));
  const job = (await w.ports.store.job(opened.ref))!;
  const hash = w.created(7n, job.expiredAt);
  const f = await w.core.fund(ME, opened.ref, hash);
  assert.ok(!isRefusal(f));
  w.chain.get(7n)!.status = JOB.Funded;
  return opened.ref;
}

async function deliveredJob(w: ReturnType<typeof world>) {
  const ref = await fundedJob(w);
  const d = await w.core.markDelivered(SELLER, ref, 'Three logo files, sent in the chat');
  assert.ok(!isRefusal(d));
  const rel = await w.core.requestRelease(ME, ref);
  assert.ok(!isRefusal(rel));
  return { ref, token: rel.link.split('/release/')[1]! };
}

test('nothing opens until the person pairs, and the link works once', async () => {
  const w = world();
  const r = await w.core.open(ME, { seller: 'ada', work: 'Logo', amountUsdc: 100, deadlineDays: 7 });
  assert.ok(isRefusal(r));
  assert.equal(r.code, 'NOT_PAIRED');
  assert.match(r.link!, /^https:\/\/karwan\.site\/pair\/tok1$/);
  assert.equal((await w.ports.store.jobsWithStatus(['quoted'])).length, 0);
  assert.deepEqual(await w.core.pair('tok1', { session: 'session_a' }), { ok: true });
  const again = await w.core.pair('tok1', { session: 'session_a' });
  assert.ok(isRefusal(again) && again.code === 'TOKEN_USED');
});

test('a pairing link expires after 30 minutes', async () => {
  const w = world();
  await w.core.open(ME, { seller: 'ada', work: 'Logo', amountUsdc: 100, deadlineDays: 7 });
  w.advance(31 * 60_000);
  const late = await w.core.pair('tok1', { session: 'session_a' });
  assert.ok(isRefusal(late) && late.code === 'TOKEN_USED');
});

test('the quote is the work plus half the fee, with the exact create call', async () => {
  const w = world();
  await w.pairMe();
  const r = await w.core.open(ME, { seller: 'ada', work: 'Logo', amountUsdc: 110, deadlineDays: 7 });
  assert.ok(!isRefusal(r));
  assert.deepEqual(r.quote, { workUsdc: '110', feeUsdc: '0.55', totalUsdc: '110.55' });
  const d = decodeFunctionData({ abi: jobEscrowAbi, data: r.calls![0]!.data });
  assert.equal(d.functionName, 'createJobWithTerms');
  assert.equal(d.args[0], PROVIDER);
  assert.equal(d.args[1], EVALUATOR);
  assert.deepEqual(d.args[4], AGENT_JOB_TERMS);
});

test('a seller who switched outside agents off, yourself, and over the cap are refused', async () => {
  const w = world();
  await w.pairMe();
  const over = await w.core.open(ME, { seller: 'ada', work: 'Logo', amountUsdc: 1_000.01, deadlineDays: 7 });
  assert.ok(isRefusal(over) && over.code === 'OVER_CAP');
  assert.match(over.message, /1000 USDC/);
  const nobody = await w.core.open(ME, { seller: 'tunde', work: 'Logo', amountUsdc: 10, deadlineDays: 7 });
  assert.ok(isRefusal(nobody) && nobody.code === 'NO_SELLER');
  const self = await w.core.open({ agentAddress: PROVIDER, humanKeyDigest: 'human-1' }, { seller: 'ada', work: 'Logo', amountUsdc: 10, deadlineDays: 7 });
  assert.ok(isRefusal(self) && self.code === 'SELF');
  w.switchOff();
  const off = await w.core.open(ME, { seller: 'ada', work: 'Logo', amountUsdc: 10, deadlineDays: 7 });
  assert.ok(isRefusal(off) && off.code === 'SELLER_OFF');
});

test('funding refuses a receipt with the wrong provider or reviewer, or another job', async () => {
  const w = world();
  await w.pairMe();
  const r = await w.core.open(ME, { seller: 'ada', work: 'Logo', amountUsdc: 100, deadlineDays: 7 });
  assert.ok(!isRefusal(r));
  const job = (await w.ports.store.job(r.ref))!;
  const wrongProvider = w.created(1n, job.expiredAt, { provider: getAddress('0x00000000000000000000000000000000000000f1') });
  const a = await w.core.fund(ME, r.ref, wrongProvider);
  assert.ok(isRefusal(a) && a.code === 'BAD_RECEIPT');
  const wrongEvaluator = w.created(2n, job.expiredAt, { evaluator: AGENT });
  const b = await w.core.fund(ME, r.ref, wrongEvaluator);
  assert.ok(isRefusal(b) && b.code === 'BAD_RECEIPT');
  const wrongDeadline = w.created(3n, job.expiredAt + DAY);
  const c = await w.core.fund(ME, r.ref, wrongDeadline);
  assert.ok(isRefusal(c) && c.code === 'BAD_RECEIPT');
  const someoneElse = await w.core.fund({ agentAddress: AGENT, humanKeyDigest: 'human-2' }, r.ref, w.created(4n, job.expiredAt));
  assert.ok(isRefusal(someoneElse) && someoneElse.code === 'NOT_YOURS');
});

test('funding hands over budget, approve and fund with exact amounts, and says what the wallet lacks', async () => {
  const w = world();
  await w.pairMe();
  w.setBalance(60_000_000n);
  const r = await w.core.open(ME, { seller: 'ada', work: 'Logo', amountUsdc: 100, deadlineDays: 7 });
  assert.ok(!isRefusal(r));
  const job = (await w.ports.store.job(r.ref))!;
  const f = await w.core.fund(ME, r.ref, w.created(9n, job.expiredAt));
  assert.ok(!isRefusal(f));
  assert.equal(f.needUsdc, '40.5');
  const [budget, approve, fund] = f.calls!;
  assert.deepEqual(decodeFunctionData({ abi: jobEscrowAbi, data: budget!.data }).args, [9n, 100_000_000n, '0x']);
  assert.deepEqual(decodeFunctionData({ abi: erc20Abi, data: approve!.data }).args, [JOBS, 100_500_000n]);
  assert.deepEqual(decodeFunctionData({ abi: jobEscrowAbi, data: fund!.data }).args, [9n, 100_000_000n, '0x']);
  const another = await w.core.open(ME, { seller: 'ada', work: 'Logo 2', amountUsdc: 100, deadlineDays: 7 });
  assert.ok(!isRefusal(another));
  const reused = await w.core.fund(ME, another.ref, `0x${(9n).toString(16)}aa`);
  assert.ok(isRefusal(reused) && reused.code === 'BAD_RECEIPT');
});

test('a funded job carries on after the seller switches outside agents off', async () => {
  const w = world();
  const ref = await fundedJob(w);
  w.switchOff();
  const s = await w.core.status(ME, ref);
  assert.ok(!isRefusal(s));
  assert.equal(s.status, 'funded');
  assert.deepEqual(w.told, ['agent_job.funded']);
  const d = await w.core.markDelivered(SELLER, ref, 'Done');
  assert.ok(!isRefusal(d) && d.job.status === 'submitted');
});

test('only the paired person answers the release link; a happy answer completes', async () => {
  const w = world();
  const { ref, token } = await deliveredJob(w);
  const other = await w.core.answer(token, { session: 'session_b' }, { happy: true });
  assert.ok(isRefusal(other) && other.code === 'WRONG_PERSON');
  assert.deepEqual(w.sent, [], 'a stranger never reaches the evaluator');
  const ok = await w.core.answer(token, { session: 'session_a' }, { happy: true });
  assert.deepEqual(ok, { ok: true, status: 'completed' });
  assert.deepEqual(w.sent, ['complete:7']);
  const again = await w.core.answer(token, { session: 'session_a' }, { happy: true });
  assert.ok(isRefusal(again) && again.code === 'TOKEN_USED');
  assert.equal((await w.ports.store.job(ref))!.status, 'completed');
});

test('not happy rejects with the person\'s line; unanswered in 3 days the money comes back', async () => {
  const w = world();
  const { ref, token } = await deliveredJob(w);
  const blank = await w.core.answer(token, { session: 'session_a' }, { happy: false, note: ' ' });
  assert.ok(isRefusal(blank) && blank.code === 'BAD_NOTE');
  const no = await w.core.answer(token, { session: 'session_a' }, { happy: false, note: 'Only one file came' });
  assert.deepEqual(no, { ok: true, status: 'rejected' });
  assert.ok(w.told.includes('agent_job.rejected'));
  assert.deepEqual(await w.core.tick(), []);
  w.advance(REJECT_WINDOW_MS);
  assert.deepEqual(await w.core.tick(), [{ ref, step: 'confirmRejection' }]);
  assert.equal((await w.ports.store.job(ref))!.status, 'refunded');
});

test('the seller can take a rejection to a dispute within 3 days, not after', async () => {
  const w = world();
  const { ref, token } = await deliveredJob(w);
  await w.core.answer(token, { session: 'session_a' }, { happy: false, note: 'Only one file came' });
  const d = await w.core.sellerDispute(SELLER, ref, 'All three files are in the chat');
  assert.ok(!isRefusal(d) && d.job.status === 'disputed');
  assert.deepEqual(await w.core.tick(), [], 'a disputed job waits for the ruling');

  const w2 = world();
  const second = await deliveredJob(w2);
  await w2.core.answer(second.token, { session: 'session_a' }, { happy: false, note: 'No' });
  w2.advance(REJECT_WINDOW_MS);
  const late = await w2.core.sellerDispute(SELLER, second.ref, 'It was fine');
  assert.ok(isRefusal(late) && late.code === 'LATE');
});

test('silence pays the seller when the review ends, after a reminder a day before', async () => {
  const w = world();
  const { ref } = await deliveredJob(w);
  const review = AGENT_JOB_TERMS.reviewWindow * 1000;
  w.advance(review - DAY);
  assert.deepEqual(await w.core.tick(), [{ ref, step: 'remind' }]);
  const s = await w.core.status(ME, ref);
  assert.ok(!isRefusal(s) && s.remindYourPerson === true);
  assert.deepEqual(await w.core.tick(), []);
  w.advance(DAY);
  assert.deepEqual(await w.core.tick(), [{ ref, step: 'release' }]);
  assert.deepEqual(w.sent, ['release:7']);
  assert.equal((await w.ports.store.job(ref))!.status, 'completed');
});

test('the runner never releases a job the person already answered on chain', async () => {
  const w = world();
  const { ref } = await deliveredJob(w);
  w.chain.get(7n)!.status = JOB.Completed;
  w.advance(AGENT_JOB_TERMS.reviewWindow * 1000);
  assert.deepEqual(await w.core.tick(), []);
  assert.deepEqual(w.sent, []);
  assert.equal((await w.ports.store.job(ref))!.status, 'completed');
});

test('past the deadline with no delivery, the agent gets the refund call and the seller cannot deliver', async () => {
  const w = world();
  const ref = await fundedJob(w);
  w.advance(8 * DAY);
  const s = await w.core.status(ME, ref);
  assert.ok(!isRefusal(s));
  assert.equal(decodeFunctionData({ abi: jobEscrowAbi, data: s.calls![0]!.data }).functionName, 'claimRefund');
  const d = await w.core.markDelivered(SELLER, ref, 'Late');
  assert.ok(isRefusal(d) && d.code === 'LATE');
});

test('the release link is only for submitted work, and the session key is never an account', async () => {
  const w = world();
  const ref = await fundedJob(w);
  const early = await w.core.requestRelease(ME, ref);
  assert.ok(isRefusal(early) && early.code === 'WRONG_STATE');
  assert.equal(personKey('HUMAN-1'), 'agent:human-1');
  assert.equal(keccak256(toBytes('happy')).length, 66);
});
