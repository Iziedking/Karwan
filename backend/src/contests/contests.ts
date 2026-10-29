import { formatUnits, parseUnits, type Address, type Hex } from 'viem';
import { contestPayouts, withHalfFee } from '../chain/jobEscrow.js';
import type { Contest, ContestEntry, ContestsStore } from '../db/contests.js';
import type { Photo } from '../listings/photos.js';
import { entryFingerprint, type EntryFile } from './entryFiles.js';

/// Contests on the job escrow (view 40). The buying agent puts up the prize
/// and is the one who awards it; each entrant's selling agent enters with the
/// fingerprint of their work; winners are paid on chain in place order, and a
/// prize nobody picked goes back after the award date. Every step is proved
/// from its receipt by the chain port before anyone is told.

const DAY = 86_400_000;
const USDC = 6;
export const DEFAULT_SHARES: Record<number, number[]> = { 1: [10_000], 2: [7_000, 3_000], 3: [5_000, 3_000, 2_000] };
const MAX_PLACES = 3;
const MAX_DESCRIPTION_BYTES = 2_048;

export interface ContestInput {
  title: string;
  brief: string;
  prizeUsdc: string;
  places: number;
  shares?: number[];
  entriesDays: number;
  awardDays?: number;
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
  ifNobody: string;
}

type Refusal = { ok: false; code: string; message: string; needMicros?: string };

export interface ContestChain {
  open(walletId: string, t: { client: Address; evaluator: Address; prize: bigint; feeBps: number; entriesBy: bigint; awardBy: bigint; shares: number[]; description: string }): Promise<{ jobId: bigint; txHash: Hex }>;
  enter(walletId: string, jobId: bigint, fingerprint: Hex, entrant: Address): Promise<Hex>;
  award(walletId: string, jobId: bigint, winners: Address[], net: bigint[]): Promise<Hex>;
  cancel(walletId: string, jobId: bigint, client: Address): Promise<{ txHash: Hex; back: bigint }>;
  giveBack(jobId: bigint, client: Address): Promise<{ txHash: Hex; back: bigint }>;
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
  chain: ContestChain;
  tell(kind: string, payload: Record<string, unknown>): void;
  now(): number;
  newId(prefix: string): string;
}

const lower = (a: string) => a.toLowerCase();
const usdc = (micros: bigint) => formatUnits(micros, USDC);
const refuse = (code: string, message: string, extra: { needMicros?: string } = {}): Refusal => ({ ok: false, code, message, ...extra });

export function createContests(p: ContestPorts) {
  const posting = new Set<string>();
  const entering = new Set<string>();

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
    if (!Number.isInteger(input.places) || input.places < 1 || input.places > MAX_PLACES) return refuse('BAD_TERMS', 'A contest has one to three winners.');
    const shares = input.shares ?? DEFAULT_SHARES[input.places]!;
    if (shares.length !== input.places || shares.some((s) => !Number.isInteger(s) || s <= 0) || shares.reduce((a, b) => a + b, 0) !== 10_000) {
      return refuse('BAD_TERMS', 'The winners share the whole prize, each a part of it.');
    }
    if (!Number.isInteger(input.entriesDays) || input.entriesDays < 1 || input.entriesDays > 30) return refuse('BAD_TERMS', 'Entries stay open 1 to 30 days.');
    const awardDays = input.awardDays ?? 7;
    if (!Number.isInteger(awardDays) || awardDays < 1 || awardDays > 60) return refuse('BAD_TERMS', 'You pick the winners within 1 to 60 days of entries closing.');
    const entriesBy = p.now() + input.entriesDays * DAY;
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
        awardBy: entriesBy + awardDays * DAY,
        ifNobody: 'If you pick nobody by then, the prize comes back to you, and your record shows the contest was not awarded.',
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
        id, buyer, buyerAgent: agent.address, title: d.card.title, brief: d.card.brief, tags: input.tags ?? [],
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
        return { ok: true, contest: live };
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
        const tx = await p.chain.enter(agent.walletId, BigInt(c.chainId!), fingerprint, agent.address);
        const live = (await p.store.patchEntry(id, { status: 'in', enterTx: tx }))!;
        if (before) await p.store.patchEntry(before.id, { status: 'replaced' });
        p.tell('contest.entered', { contestId, entryId: id, buyer: c.buyer, seller, replaced: !!before });
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
    if (p.now() >= c.awardBy) return refuse('AWARD_CLOSED', 'The date to pick winners has passed; the prize goes back to you.');
    const n = entryIds.length;
    if (n === 0 || n > c.shares.length || new Set(entryIds).size !== n) return refuse('BAD_WINNERS', `Pick one to ${c.shares.length} different entries.`);
    if (p.now() < c.entriesBy && n !== c.shares.length) return refuse('BAD_WINNERS', `Before entries close, pick all ${c.shares.length} places.`);
    const picked: ContestEntry[] = [];
    for (const id of entryIds) {
      const e = await p.store.entry(id);
      if (!e || e.contestId !== contestId || e.status !== 'in') return refuse('BAD_WINNERS', 'Only entries in this contest can win.');
      picked.push(e);
    }
    const agent = await p.buyerAgentFor(c.buyer);
    if (!agent) return refuse('NO_BUYER_AGENT', 'Your agent is not set up.');
    if (!(await p.store.patchIfStatus(contestId, ['open'], { status: 'awarding' }))) return refuse('BUSY', 'The winners are already being paid.');
    const pay = contestPayouts(BigInt(c.prizeMicros), c.feeBps, c.shares, n);
    try {
      const tx = await p.chain.award(agent.walletId, BigInt(c.chainId!), picked.map((e) => e.sellerAgent), pay.net);
      const winners = picked.map((e, i) => ({ entryId: e.id, place: i + 1, netMicros: pay.net[i]!.toString() }));
      const done = (await p.store.patch(contestId, { status: 'awarded', awardTx: tx, winners, backMicros: pay.back.toString() }))!;
      for (const e of await p.store.entries(contestId)) {
        if (entryIds.includes(e.id)) await p.store.patchEntry(e.id, { status: 'won' });
        else if (e.status === 'in') await p.store.patchEntry(e.id, { status: 'lost' });
      }
      p.tell('contest.awarded', { contestId, buyer: c.buyer, winners: picked.map((e, i) => ({ seller: e.seller, netMicros: winners[i]!.netMicros })) });
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
      const r = await p.chain.cancel(agent.walletId, BigInt(c.chainId!), c.buyerAgent);
      const done = (await p.store.patch(contestId, { status: 'cancelled', refundTx: r.txHash, backMicros: r.back.toString() }))!;
      p.tell('contest.cancelled', { contestId, buyer: c.buyer });
      return { ok: true, contest: done };
    } catch (err) {
      await p.store.patch(contestId, { status: 'open' });
      return refuse('CANCEL_FAILED', `The contest was not taken back: ${(err as Error).message}`);
    }
  }

  /// Returns every prize past its award date; the count returned this pass.
  async function returnDue(): Promise<number> {
    let returned = 0;
    for (const c of await p.store.list({ status: ['open'] })) {
      if (p.now() < c.awardBy || !c.chainId) continue;
      if (!(await p.store.patchIfStatus(c.id, ['open'], { status: 'awarding' }))) continue;
      try {
        const r = await p.chain.giveBack(BigInt(c.chainId), c.buyerAgent);
        await p.store.patch(c.id, { status: 'returned', refundTx: r.txHash, backMicros: r.back.toString() });
        for (const e of await p.store.entries(c.id)) if (e.status === 'in') await p.store.patchEntry(e.id, { status: 'lost' });
        p.tell('contest.returned', { contestId: c.id, buyer: c.buyer });
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

  return { draft, post, enter, award, cancel, returnDue, mayReadFiles, mayReadPreview, awardCard };
}

export type Contests = ReturnType<typeof createContests>;
