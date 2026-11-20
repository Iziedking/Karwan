import { formatUnits, keccak256, parseUnits, toBytes, type Address, type Hex } from 'viem';
import { contestPayouts, withHalfFee } from '../chain/jobEscrow.js';
import type { Contest, ContestEntry, ContestKind, ContestsStore } from '../db/contests.js';
import type { Photo } from '../listings/photos.js';
import { entryFingerprint, type EntryFile } from './entryFiles.js';
import type { FitInput } from '../agents/fitAlert.js';

/// Contests on the job escrow (view 40). The buying agent puts up the prize
/// and is the one who awards it; each entrant's selling agent enters with the
/// fingerprint of their work; winners are paid on chain in place order, and a
/// prize nobody picked goes back after the award date. Every step is proved
/// from its receipt by the chain port before anyone is told.

const DAY = 86_400_000;
const USDC = 6;
/// The suggested split for each number of winners (view 88 decision 6). The
/// person running the contest can keep it, share equally, or set their own.
export const DEFAULT_SHARES: Record<number, number[]> = {
  1: [10_000],
  2: [7_000, 3_000],
  3: [5_000, 3_000, 2_000],
  4: [4_000, 3_000, 2_000, 1_000],
  5: [3_500, 2_500, 2_000, 1_200, 800],
  6: [3_000, 2_200, 1_700, 1_300, 1_000, 800],
  7: [2_800, 2_000, 1_500, 1_200, 1_000, 800, 700],
  8: [2_500, 1_800, 1_400, 1_200, 1_000, 800, 700, 600],
};
/// Both job escrows take up to 8 places (BountyLib MAX_PLACES).
export const MAX_PLACES = 8;

/// Equal shares in basis points; what cannot split evenly goes to the first places.
export function equalShares(places: number): number[] {
  const base = Math.floor(10_000 / places);
  const extra = 10_000 - base * places;
  return Array.from({ length: places }, (_, i) => base + (i < extra ? 1 : 0));
}
const MAX_DESCRIPTION_BYTES = 2_048;
/// After judging ends with nobody picked, the buyer has this long before the
/// contract pays the earliest entries (view 88, BountyLib WAIT).
export const PAYOUT_WAIT_MS = 3 * DAY;

/// Entry and judging periods per kind, in days (view 88).
export const KINDS: Record<ContestKind, { entries: [number, number]; judging: [number, number]; judgingDefault: number }> = {
  design: { entries: [1, 30], judging: [3, 14], judgingDefault: 7 },
  bugs: { entries: [1, 60], judging: [3, 30], judgingDefault: 14 },
  hackathon: { entries: [1, 60], judging: [3, 30], judgingDefault: 14 },
};
const IF_NOBODY_PROTECTS =
  'If you pick nobody by the end of judging, you have 3 more days to pick. After that the prize goes to the earliest entries, and your record shows the contest was not judged. If nobody enters, you can take the prize back.';

export interface ContestInput {
  title: string;
  brief: string;
  prizeUsdc: string;
  places: number;
  shares?: number[];
  entriesDays: number;
  /// Days of judging after entries close.
  awardDays?: number;
  kind?: ContestKind;
  tags?: string[];
}

export interface ContestCard {
  title: string;
  brief: string;
  prizeMicros: string;
  feeHalfMicros: string;
  totalMicros: string;
  shares: number[];
  placeNetMicros: string[];
  entriesBy: number;
  awardBy: number;
  /// When the contract pays the earliest entries if nobody is picked; only on
  /// the second escrow.
  payoutFrom?: number;
  kind?: ContestKind;
  ifNobody: string;
}

type Refusal = { ok: false; code: string; message: string; needMicros?: string };

export interface ContestChain {
  open(walletId: string, t: { client: Address; evaluator: Address; prize: bigint; feeBps: number; entriesBy: bigint; awardBy: bigint; shares: number[]; description: string }): Promise<{ jobId: bigint; txHash: Hex }>;
  enter(walletId: string, jobId: bigint, fingerprint: Hex, entrant: Address): Promise<Hex>;
  award(walletId: string, jobId: bigint, winners: Address[], net: bigint[]): Promise<Hex>;
  cancel(walletId: string, jobId: bigint, client: Address): Promise<{ txHash: Hex; back: bigint }>;
  giveBack(jobId: bigint, client: Address): Promise<{ txHash: Hex; back: bigint }>;
  /// Second escrow: the buyer's agent marks an entrant's entry not valid.
  markNotValid(walletId: string, jobId: bigint, entrant: Address, reasonHash: Hex): Promise<Hex>;
  /// Second escrow, after the wait: pays the earliest valid entries, or gives
  /// the prize back when there are none. Proved from the receipt.
  payOut(jobId: bigint, client: Address): Promise<{ txHash: Hex; paid: { agent: Address; netMicros: bigint }[]; back: bigint }>;
}

export interface ContestPorts {
  store: ContestsStore;
  saveEntryFiles(entryId: string, files: EntryFile[]): void;
  savePreview(entryId: string, photo: Photo): void;
  openingConfig(): Promise<{ open: boolean; feeBps: number; perDealCap: bigint }>;
  buyerAgentFor(buyer: Address): Promise<{ walletId: string; address: Address } | null>;
  sellerAgentFor(seller: Address): Promise<{ walletId: string; address: Address } | null>;
  /// The identity a wallet belongs to on the record, 0 for none.
  identityOf(wallet: Address): Promise<bigint>;
  balanceOf(wallet: Address): Promise<bigint>;
  /// The money-out guard and the chat limits, as on funding a deal.
  guard(buyer: Address, amountMicros: bigint, reference: string): Promise<{ ok: true } | { ok: false; code: string; message: string }>;
  /// New contests open on the second job escrow (view 88), `chain`; the ones
  /// already open on the first stay on `legacyChain`.
  protects?: boolean;
  chain: ContestChain;
  legacyChain?: ContestChain;
  tell(kind: string, payload: Record<string, unknown>): void;
  /// View 96: the sellers a contest fits, by the words of its title, brief and
  /// tags, and the one fit path that tells them. Both set, or neither.
  reach?(c: Contest): Promise<Address[]>;
  tellFit?(input: FitInput): Promise<unknown>;
  now(): number;
  newId(prefix: string): string;
}

const DAY_MS = 86_400_000;

const lower = (a: string) => a.toLowerCase();
/// Everyone with an entry that was in, once each (view 96).
const entrantsOf = (entries: ContestEntry[]) => [...new Set(entries.filter((e) => e.status !== 'replaced' && e.status !== 'failed').map((e) => lower(e.seller)))];
const usdc = (micros: bigint) => formatUnits(micros, USDC);
const refuse = (code: string, message: string, extra: { needMicros?: string } = {}): Refusal => ({ ok: false, code, message, ...extra });

export function createContests(p: ContestPorts) {
  const posting = new Set<string>();
  const entering = new Set<string>();
  const marking = new Set<string>();
  /// The escrow a contest lives on.
  const chainOf = (c: Contest): ContestChain => (p.protects && !c.protects && p.legacyChain ? p.legacyChain : p.chain);
  /// The last moment the buyer can pick, or mark an entry.
  const pickUntil = (c: Contest) => (c.protects ? c.awardBy + PAYOUT_WAIT_MS : c.awardBy);

  function draft(input: ContestInput, feeBps: number): { ok: true; card: ContestCard; prize: bigint } | Refusal {
    const title = input.title.trim();
    const brief = input.brief.trim();
    if (!title || title.length > 80) return refuse('BAD_TERMS', 'Give the contest a short title.');
    if (!brief || brief.length > 1_500) return refuse('BAD_TERMS', 'Say what you want in up to 1,500 characters.');
    if (Buffer.byteLength(`${title}: ${brief}`) > MAX_DESCRIPTION_BYTES) return refuse('BAD_TERMS', 'Shorten what you want.');
    let prize: bigint;
    try {
      prize = parseUnits(input.prizeUsdc, USDC);
    } catch {
      return refuse('BAD_TERMS', 'The prize must be an amount in USDC.');
    }
    if (prize <= 0n) return refuse('BAD_TERMS', 'The prize must be more than 0.');
    if (!Number.isInteger(input.places) || input.places < 1 || input.places > MAX_PLACES) return refuse('BAD_TERMS', 'A contest has one to eight winners.');
    const shares = input.shares ?? DEFAULT_SHARES[input.places]!;
    if (shares.length !== input.places || shares.some((s) => !Number.isInteger(s) || s <= 0) || shares.reduce((a, b) => a + b, 0) !== 10_000) {
      return refuse('BAD_TERMS', 'The winners share the whole prize, each a part of it.');
    }
    const kind: ContestKind = input.kind ?? 'design';
    if (!(kind in KINDS)) return refuse('BAD_TERMS', 'A contest is a design or writing contest, a bug bounty or a hackathon.');
    const k = KINDS[kind];
    const [eMin, eMax] = p.protects ? k.entries : [1, 30];
    const [jMin, jMax] = p.protects ? k.judging : [1, 60];
    if (!Number.isInteger(input.entriesDays) || input.entriesDays < eMin || input.entriesDays > eMax) {
      return refuse('BAD_TERMS', `Entries stay open ${eMin} to ${eMax} days.`);
    }
    const awardDays = input.awardDays ?? (p.protects ? k.judgingDefault : 7);
    if (!Number.isInteger(awardDays) || awardDays < jMin || awardDays > jMax) {
      return refuse('BAD_TERMS', `Judging lasts ${jMin} to ${jMax} days after entries close.`);
    }
    const entriesBy = p.now() + input.entriesDays * DAY;
    const awardBy = entriesBy + awardDays * DAY;
    const pay = contestPayouts(prize, feeBps, shares, shares.length);
    return {
      ok: true,
      prize,
      card: {
        title,
        brief,
        prizeMicros: prize.toString(),
        feeHalfMicros: (pay.funded - prize).toString(),
        totalMicros: pay.funded.toString(),
        shares,
        placeNetMicros: pay.net.map(String),
        entriesBy,
        awardBy,
        ...(p.protects
          ? { kind, payoutFrom: awardBy + PAYOUT_WAIT_MS, ifNobody: IF_NOBODY_PROTECTS }
          : { ifNobody: 'If you pick nobody by then, the prize comes back to you, and your record shows the contest was not awarded.' }),
      },
    };
  }

  async function post(buyer: Address, input: ContestInput, opts: { conversationId?: string } = {}): Promise<{ ok: true; contest: Contest } | Refusal> {
    const key = lower(buyer);
    if (posting.has(key)) return refuse('BUSY', 'Your contest is already being posted.');
    posting.add(key);
    try {
      const cfg = await p.openingConfig();
      if (!cfg.open) return refuse('NOT_OPEN', 'Contests are paused for now.');
      const d = draft(input, cfg.feeBps);
      if (!d.ok) return d;
      const total = BigInt(d.card.totalMicros);
      if (total > cfg.perDealCap) return refuse('OVER_CAP', `A contest can hold up to ${usdc(cfg.perDealCap)} USDC with the fee for now.`);
      const agent = await p.buyerAgentFor(buyer);
      if (!agent) return refuse('NO_BUYER_AGENT', 'Set up your agent first.');
      const balance = await p.balanceOf(agent.address);
      if (balance < total) {
        return refuse('BUYER_AGENT_SHORT', `Add ${usdc(total - balance)} USDC to post this contest.`, { needMicros: (total - balance).toString() });
      }
      const id = p.newId('c');
      const pass = await p.guard(buyer, total, `contest:${id}`);
      if (!pass.ok) return refuse(pass.code, pass.message);
      const at = p.now();
      const contest: Contest = {
        id, ...(p.protects ? { protects: true, kind: d.card.kind } : {}), buyer, buyerAgent: agent.address, title: d.card.title, brief: d.card.brief, tags: input.tags ?? [],
        prizeMicros: d.card.prizeMicros, feeBps: cfg.feeBps, shares: d.card.shares,
        entriesBy: d.card.entriesBy, awardBy: d.card.awardBy, status: 'opening',
        ...(opts.conversationId ? { conversationId: opts.conversationId } : {}), createdAt: at, updatedAt: at,
      };
      await p.store.create(contest);
      try {
        const opened = await p.chain.open(agent.walletId, {
          client: agent.address, evaluator: agent.address, prize: d.prize, feeBps: cfg.feeBps,
          entriesBy: BigInt(Math.floor(d.card.entriesBy / 1000)), awardBy: BigInt(Math.floor(d.card.awardBy / 1000)),
          shares: d.card.shares, description: `${d.card.title}: ${d.card.brief}`,
        });
        const live = (await p.store.patch(id, { status: 'open', chainId: opened.jobId.toString(), openTx: opened.txHash }))!;
        p.tell('contest.opened', { contestId: id, buyer, prizeMicros: live.prizeMicros, tags: live.tags, title: live.title });
        return { ok: true, contest: (await tellFits(live)) ?? live };
      } catch (err) {
        await p.store.patch(id, { status: 'failed' });
        return refuse('OPEN_FAILED', `The contest did not open: ${(err as Error).message}`);
      }
    } finally {
      posting.delete(key);
    }
  }

  async function ownWallet(seller: Address, sellerAgent: Address, c: Contest): Promise<boolean> {
    if (lower(seller) === lower(c.buyer) || lower(sellerAgent) === lower(c.buyerAgent)) return true;
    const [a, b, s, w] = await Promise.all([p.identityOf(sellerAgent), p.identityOf(c.buyerAgent), p.identityOf(seller), p.identityOf(c.buyer)]);
    return (a !== 0n && (a === b || a === w)) || (s !== 0n && (s === b || s === w));
  }

  async function enter(
    seller: Address,
    contestId: string,
    work: { files: EntryFile[]; note: string; preview?: Photo },
  ): Promise<{ ok: true; entry: ContestEntry } | Refusal> {
    const c = await p.store.get(contestId);
    if (!c) return refuse('NOT_FOUND', 'That contest is not on Karwan.');
    if (c.status !== 'open' || p.now() >= c.entriesBy) return refuse('CLOSED', 'Entries for this contest have closed.');
    if (lower(seller) === lower(c.buyer)) return refuse('OWN_CONTEST', 'You cannot enter your own contest.');
    if (work.files.length === 0) return refuse('NO_FILES', 'Add your work to enter.');
    if (work.note.length > 500) return refuse('BAD_TERMS', 'Keep the note under 500 characters.');
    const preview = work.preview ?? work.files.find((f) => f.contentType !== 'application/pdf');
    if (!preview) return refuse('NEED_PREVIEW', 'Add one image the buyer can see before they pick.');
    const agent = await p.sellerAgentFor(seller);
    if (!agent) return refuse('NO_SELLER_AGENT', 'Set up your agent first.');
    if (await ownWallet(seller, agent.address, c)) return refuse('OWN_CONTEST', 'You cannot enter your own contest.');
    const key = `${contestId}:${lower(seller)}`;
    if (entering.has(key)) return refuse('BUSY', 'Your entry is already on its way.');
    entering.add(key);
    try {
      const id = p.newId('e');
      const fingerprint = entryFingerprint(work.files.map((f) => f.bytes), work.note);
      p.saveEntryFiles(id, work.files);
      p.savePreview(id, preview as Photo);
      const at = p.now();
      const entry: ContestEntry = {
        id, contestId, seller, sellerAgent: agent.address, note: work.note, previewId: id, files: work.files.length,
        fingerprint, status: 'entering', createdAt: at, updatedAt: at,
      };
      const before = await p.store.liveEntryBy(contestId, seller);
      await p.store.createEntry(entry);
      try {
        const tx = await chainOf(c).enter(agent.walletId, BigInt(c.chainId!), fingerprint, agent.address);
        const live = (await p.store.patchEntry(id, { status: 'in', enterTx: tx }))!;
        if (before) await p.store.patchEntry(before.id, { status: 'replaced' });
        p.tell('contest.entered', { contestId, entryId: id, buyer: c.buyer, seller, replaced: !!before, title: c.title });
        return { ok: true, entry: live };
      } catch (err) {
        await p.store.patchEntry(id, { status: 'failed' });
        return refuse('ENTER_FAILED', `Your entry did not go in: ${(err as Error).message}`);
      }
    } finally {
      entering.delete(key);
    }
  }

  async function award(buyer: Address, contestId: string, entryIds: string[]): Promise<{ ok: true; contest: Contest } | Refusal> {
    const c = await p.store.get(contestId);
    if (!c) return refuse('NOT_FOUND', 'That contest is not on Karwan.');
    if (lower(buyer) !== lower(c.buyer)) return refuse('NOT_BUYER', 'Only the buyer picks the winners.');
    if (c.status !== 'open') return refuse('NOT_OPEN', 'This contest is not waiting for winners.');
    if (p.now() >= pickUntil(c)) {
      return refuse('AWARD_CLOSED', c.protects
        ? 'The date to pick winners has passed; the prize goes to the earliest entries.'
        : 'The date to pick winners has passed; the prize goes back to you.');
    }
    const n = entryIds.length;
    if (n === 0 || n > c.shares.length || new Set(entryIds).size !== n) return refuse('BAD_WINNERS', `Pick one to ${c.shares.length} different entries.`);
    if (p.now() < c.entriesBy && n !== c.shares.length) return refuse('BAD_WINNERS', `Before entries close, pick all ${c.shares.length} places.`);
    const picked: ContestEntry[] = [];
    for (const id of entryIds) {
      const e = await p.store.entry(id);
      if (!e || e.contestId !== contestId || e.status !== 'in') return refuse('BAD_WINNERS', 'Only entries in this contest can win.');
      if (e.notValid) return refuse('BAD_WINNERS', 'An entry you marked not valid cannot win.');
      picked.push(e);
    }
    const agent = await p.buyerAgentFor(c.buyer);
    if (!agent) return refuse('NO_BUYER_AGENT', 'Your agent is not set up.');
    if (!(await p.store.patchIfStatus(contestId, ['open'], { status: 'awarding' }))) return refuse('BUSY', 'The winners are already being paid.');
    const pay = contestPayouts(BigInt(c.prizeMicros), c.feeBps, c.shares, n);
    try {
      const tx = await chainOf(c).award(agent.walletId, BigInt(c.chainId!), picked.map((e) => e.sellerAgent), pay.net);
      const winners = picked.map((e, i) => ({ entryId: e.id, place: i + 1, netMicros: pay.net[i]!.toString() }));
      const done = (await p.store.patch(contestId, { status: 'awarded', awardTx: tx, winners, backMicros: pay.back.toString() }))!;
      for (const e of await p.store.entries(contestId)) {
        if (entryIds.includes(e.id)) await p.store.patchEntry(e.id, { status: 'won' });
        else if (e.status === 'in') await p.store.patchEntry(e.id, { status: 'lost' });
      }
      p.tell('contest.awarded', { contestId, buyer: c.buyer, title: c.title, winners: picked.map((e, i) => ({ seller: e.seller, netMicros: winners[i]!.netMicros })) });
      return { ok: true, contest: done };
    } catch (err) {
      await p.store.patch(contestId, { status: 'open' });
      return refuse('AWARD_FAILED', `The winners were not paid: ${(err as Error).message}`);
    }
  }

  async function cancel(buyer: Address, contestId: string): Promise<{ ok: true; contest: Contest } | Refusal> {
    const c = await p.store.get(contestId);
    if (!c) return refuse('NOT_FOUND', 'That contest is not on Karwan.');
    if (lower(buyer) !== lower(c.buyer)) return refuse('NOT_BUYER', 'Only the buyer can take a contest back.');
    if ((await p.store.entries(contestId)).some((e) => e.status === 'in' || e.status === 'entering')) {
      return refuse('HAS_ENTRIES', 'Someone has entered, so the contest stays open. Pick the winners, or the prize comes back after the date.');
    }
    const agent = await p.buyerAgentFor(c.buyer);
    if (!agent) return refuse('NO_BUYER_AGENT', 'Your agent is not set up.');
    if (!(await p.store.patchIfStatus(contestId, ['open'], { status: 'awarding' }))) return refuse('NOT_OPEN', 'This contest can no longer be taken back.');
    try {
      const r = await chainOf(c).cancel(agent.walletId, BigInt(c.chainId!), c.buyerAgent);
      const done = (await p.store.patch(contestId, { status: 'cancelled', refundTx: r.txHash, backMicros: r.back.toString() }))!;
      p.tell('contest.cancelled', { contestId, buyer: c.buyer, title: c.title, entrants: entrantsOf(await p.store.entries(contestId)) });
      return { ok: true, contest: done };
    } catch (err) {
      await p.store.patch(contestId, { status: 'open' });
      return refuse('CANCEL_FAILED', `The contest was not taken back: ${(err as Error).message}`);
    }
  }

  /// The buyer marks an entry not valid, with a reason every entrant reads
  /// (view 88). Only on the second escrow, until the payout opens.
  async function markNotValid(buyer: Address, contestId: string, entryId: string, reason: string): Promise<{ ok: true; entry: ContestEntry } | Refusal> {
    const c = await p.store.get(contestId);
    if (!c) return refuse('NOT_FOUND', 'That contest is not on Karwan.');
    if (lower(buyer) !== lower(c.buyer)) return refuse('NOT_BUYER', 'Only the buyer marks entries.');
    if (!c.protects) return refuse('OLD_RULE', 'This contest opened before entries could be marked not valid.');
    const why = reason.trim();
    if (why.length < 5 || why.length > 280) return refuse('BAD_REASON', 'Say why in 5 to 280 characters. Every entrant reads it.');
    const e = await p.store.entry(entryId);
    if (!e || e.contestId !== contestId || e.status !== 'in') return refuse('NOT_FOUND', 'That entry is not in this contest.');
    if (e.notValid) return refuse('ALREADY_MARKED', 'That entry is already marked not valid.');
    if (c.status !== 'open') return refuse('NOT_OPEN', 'This contest is not waiting for winners.');
    if (p.now() >= pickUntil(c)) return refuse('MARK_CLOSED', 'The payout has opened, so entries can no longer be marked.');
    if (marking.has(entryId)) return refuse('BUSY', 'That entry is already being marked.');
    const agent = await p.buyerAgentFor(c.buyer);
    if (!agent) return refuse('NO_BUYER_AGENT', 'Your agent is not set up.');
    marking.add(entryId);
    try {
      const tx = await chainOf(c).markNotValid(agent.walletId, BigInt(c.chainId!), e.sellerAgent, keccak256(toBytes(why)));
      const live = (await p.store.patchEntry(entryId, { notValid: { reason: why, at: p.now(), tx } }))!;
      p.tell('contest.entry_marked', { contestId, entryId, buyer: c.buyer, seller: e.seller, title: c.title });
      return { ok: true, entry: live };
    } catch (err) {
      return refuse('MARK_FAILED', `The entry was not marked: ${(err as Error).message}`);
    } finally {
      marking.delete(entryId);
    }
  }

  /// After the wait, the contract pays the earliest valid entries, or gives
  /// the prize back when there are none (view 88).
  async function payOut(c: Contest): Promise<void> {
    const r = await chainOf(c).payOut(BigInt(c.chainId!), c.buyerAgent);
    const entries = await p.store.entries(c.id);
    if (r.paid.length === 0) {
      await p.store.patch(c.id, { status: 'returned', refundTx: r.txHash, backMicros: r.back.toString() });
      for (const e of entries) if (e.status === 'in') await p.store.patchEntry(e.id, { status: 'lost' });
      p.tell('contest.returned', { contestId: c.id, buyer: c.buyer, title: c.title, entrants: entrantsOf(entries) });
      return;
    }
    const winners: NonNullable<Contest['winners']> = [];
    const won = new Set<string>();
    for (const [i, w] of r.paid.entries()) {
      const e = entries.find((x) => x.status === 'in' && !x.notValid && lower(x.sellerAgent) === lower(w.agent));
      if (!e) continue;
      won.add(e.id);
      winners.push({ entryId: e.id, place: i + 1, netMicros: w.netMicros.toString() });
    }
    await p.store.patch(c.id, { status: 'awarded', auto: true, awardTx: r.txHash, winners, backMicros: r.back.toString() });
    for (const e of entries) {
      if (won.has(e.id)) await p.store.patchEntry(e.id, { status: 'won' });
      else if (e.status === 'in') await p.store.patchEntry(e.id, { status: 'lost' });
    }
    const sellerOf = new Map(entries.map((e) => [e.id, e.seller]));
    p.tell('contest.awarded', { contestId: c.id, buyer: c.buyer, title: c.title, auto: true, winners: winners.map((w) => ({ seller: sellerOf.get(w.entryId), netMicros: w.netMicros })) });
  }

  const fitFacts = (c: Contest) => ({ title: c.title, amountUsdc: Number(usdc(BigInt(c.prizeMicros))), winners: c.shares.length, closesAt: c.entriesBy });

  /// Tells the sellers a new contest fits (view 96). A failure never stops the
  /// contest: it is open either way.
  async function tellFits(c: Contest): Promise<Contest | null> {
    if (!p.reach || !p.tellFit) return null;
    try {
      const fits = (await p.reach(c)).filter((s) => lower(s) !== lower(c.buyer));
      for (const s of fits) await p.tellFit({ to: s, kind: 'contest', ref: c.id, what: 'fits', facts: fitFacts(c), path: `/contests/${c.id}` }).catch(() => {});
      return await p.store.patch(c.id, { told: fits.length, toldTo: fits });
    } catch {
      return null;
    }
  }

  /// One reminder a day before entries close, to the sellers told who have not
  /// entered (view 96). The count of contests reminded this pass.
  async function remindDue(): Promise<number> {
    if (!p.tellFit) return 0;
    let reminded = 0;
    const now = p.now();
    for (const c of await p.store.list({ status: ['open'] })) {
      if (c.reminded || !c.toldTo?.length || now >= c.entriesBy || c.entriesBy - now > DAY_MS) continue;
      if (!(await p.store.patchIfStatus(c.id, ['open'], { reminded: true }))) continue;
      const entered = new Set((await p.store.entries(c.id)).map((e) => lower(e.seller)));
      for (const s of c.toldTo) {
        if (entered.has(lower(s))) continue;
        await p.tellFit({ to: s, kind: 'contest', ref: c.id, what: 'reminder', facts: fitFacts(c), path: `/contests/${c.id}` }).catch(() => {});
      }
      reminded += 1;
    }
    return reminded;
  }

  /// Settles every contest past its date: on the first escrow the prize goes
  /// back at the award date; on the second, after the wait, the earliest
  /// entries are paid. The count settled this pass.
  async function returnDue(): Promise<number> {
    let returned = 0;
    for (const c of await p.store.list({ status: ['open'] })) {
      if (p.now() < pickUntil(c) || !c.chainId) continue;
      if (!(await p.store.patchIfStatus(c.id, ['open'], { status: 'awarding' }))) continue;
      if (c.protects) {
        try {
          await payOut(c);
          returned += 1;
        } catch {
          await p.store.patch(c.id, { status: 'open' });
        }
        continue;
      }
      try {
        const r = await chainOf(c).giveBack(BigInt(c.chainId), c.buyerAgent);
        await p.store.patch(c.id, { status: 'returned', refundTx: r.txHash, backMicros: r.back.toString() });
        const all = await p.store.entries(c.id);
        for (const e of all) if (e.status === 'in') await p.store.patchEntry(e.id, { status: 'lost' });
        p.tell('contest.returned', { contestId: c.id, buyer: c.buyer, title: c.title, entrants: entrantsOf(all) });
        returned += 1;
      } catch {
        await p.store.patch(c.id, { status: 'open' });
      }
    }
    return returned;
  }

  /// The entrant always sees their own files; the buyer only once that entry won.
  async function mayReadFiles(viewer: Address, entryId: string): Promise<boolean> {
    const e = await p.store.entry(entryId);
    if (!e) return false;
    if (lower(viewer) === lower(e.seller)) return true;
    const c = await p.store.get(e.contestId);
    return !!c && lower(viewer) === lower(c.buyer) && c.status === 'awarded' && e.status === 'won';
  }

  async function mayReadPreview(viewer: Address, entryId: string): Promise<boolean> {
    const e = await p.store.entry(entryId);
    if (!e) return false;
    if (lower(viewer) === lower(e.seller)) return true;
    const c = await p.store.get(e.contestId);
    return !!c && lower(viewer) === lower(c.buyer);
  }

  /// What the buyer's pick pays, for the confirm card.
  async function awardCard(contestId: string, entryIds: string[]) {
    const c = await p.store.get(contestId);
    if (!c) return null;
    const pay = contestPayouts(BigInt(c.prizeMicros), c.feeBps, c.shares, Math.min(entryIds.length, c.shares.length));
    return { netMicros: pay.net.map(String), backMicros: pay.back.toString(), totalMicros: withHalfFee(BigInt(c.prizeMicros), c.feeBps).toString() };
  }

  return { draft, post, enter, award, cancel, markNotValid, returnDue, mayReadFiles, mayReadPreview, awardCard, remindDue };
}

export type Contests = ReturnType<typeof createContests>;
