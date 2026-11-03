import { z } from 'zod';
import { AddressMap, AddressSet } from '../identity/address.js';

/// The buying mode's working notes on one request (view 48, decision 8). The
/// row in Postgres is the truth; the agent's JobState is a copy of it.

export interface NotesBid {
  seller: string;
  priceUsdc: string;
  priceWei: bigint;
  deadlineUnix: number;
}

export interface StandingLower {
  priceUsdc: string;
  deadlineUnix: number;
}

export interface Parked {
  seller: string;
  priceUsdc: string;
  pattern?: unknown;
}

/// The JobState fields the notes carry. Everything else on JobState is rebuilt
/// (the request context, the buyer profile, the escrow record) or held
/// elsewhere (timers, the market read, shadow revisions).
export interface NotesFields {
  bids: Map<string, NotesBid>;
  directOffers?: Set<string>;
  withdrawnSellers?: Set<string>;
  pendingRevisions?: Map<string, StandingLower>;
  collectionStartedAt?: number;
  collectionCloseAt?: number;
  collectionScheduleVersion: number;
  collectionFired: boolean;
  counterRoundsBySeller: Map<string, number>;
  lastCounterPriceBySeller: Map<string, string>;
  candidateQueue: NotesBid[];
  triedSellers: Set<string>;
  shortlistCandidates?: unknown[];
  shortlist?: unknown[];
  sellersAtLastPass?: Set<string>;
  lastSellerCounterBySeller: Map<string, string>;
  finalized: boolean;
  negotiationEndedAt?: number;
  negotiationEndReason?: string;
  counterWatchdogSeller?: string;
  counterWatchdogDueAt?: number;
  counterWatchdogRound?: number;
  counterScheduleVersion: number;
  parkedAgreement?: Parked | null;
  latePreemptAttempted?: boolean;
  escrowFunded: boolean;
}

const bidSchema = z.object({
  seller: z.string().min(1),
  priceUsdc: z.string().min(1),
  priceWei: z.string().regex(/^\d+$/),
  deadlineUnix: z.number().finite(),
}).passthrough();

const lowerSchema = z.object({ priceUsdc: z.string().min(1), deadlineUnix: z.number().finite() }).strict();

export const requestNotesSchema = z.object({
  bids: z.array(bidSchema),
  directOffers: z.array(z.string()).optional(),
  withdrawnSellers: z.array(z.string()).optional(),
  pendingRevisions: z.record(lowerSchema).optional(),
  collectionStartedAt: z.number().int().nonnegative().optional(),
  collectionCloseAt: z.number().int().nonnegative().optional(),
  collectionScheduleVersion: z.number().int().nonnegative(),
  collectionFired: z.boolean(),
  counterRoundsBySeller: z.record(z.number().int().nonnegative()),
  lastCounterPriceBySeller: z.record(z.string()),
  candidateQueue: z.array(z.string()),
  triedSellers: z.array(z.string()),
  shortlistCandidates: z.array(z.unknown()).optional(),
  shortlist: z.array(z.unknown()).optional(),
  sellersAtLastPass: z.array(z.string()).optional(),
  lastSellerCounterBySeller: z.record(z.string()),
  finalized: z.boolean(),
  negotiationEndedAt: z.number().int().nonnegative().optional(),
  negotiationEndReason: z.string().optional(),
  counterWatchdogSeller: z.string().optional(),
  counterWatchdogDueAt: z.number().int().nonnegative().optional(),
  counterWatchdogRound: z.number().int().nonnegative().optional(),
  counterScheduleVersion: z.number().int().nonnegative(),
  parkedAgreement: z.object({ seller: z.string(), priceUsdc: z.string(), pattern: z.unknown().optional() }).strict().nullable().optional(),
  latePreemptAttempted: z.boolean().optional(),
  escrowFunded: z.boolean(),
}).strict();

export type RequestNotes = z.infer<typeof requestNotesSchema>;

const opt = <K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> =>
  value === undefined ? {} : ({ [key]: value } as Record<K, V>);

export function toNotes(f: NotesFields): RequestNotes {
  return requestNotesSchema.parse({
    bids: [...f.bids.values()].map((b) => ({ ...b, priceWei: b.priceWei.toString() })),
    ...opt('directOffers', f.directOffers ? [...f.directOffers] : undefined),
    ...opt('withdrawnSellers', f.withdrawnSellers ? [...f.withdrawnSellers] : undefined),
    ...opt('pendingRevisions', f.pendingRevisions ? Object.fromEntries(f.pendingRevisions) : undefined),
    ...opt('collectionStartedAt', f.collectionStartedAt),
    ...opt('collectionCloseAt', f.collectionCloseAt),
    collectionScheduleVersion: f.collectionScheduleVersion,
    collectionFired: f.collectionFired,
    counterRoundsBySeller: Object.fromEntries(f.counterRoundsBySeller),
    lastCounterPriceBySeller: Object.fromEntries(f.lastCounterPriceBySeller),
    candidateQueue: f.candidateQueue.map((b) => b.seller),
    triedSellers: [...f.triedSellers],
    ...opt('shortlistCandidates', f.shortlistCandidates),
    ...opt('shortlist', f.shortlist),
    ...opt('sellersAtLastPass', f.sellersAtLastPass ? [...f.sellersAtLastPass] : undefined),
    lastSellerCounterBySeller: Object.fromEntries(f.lastSellerCounterBySeller),
    finalized: f.finalized,
    ...opt('negotiationEndedAt', f.negotiationEndedAt),
    ...opt('negotiationEndReason', f.negotiationEndReason),
    ...opt('counterWatchdogSeller', f.counterWatchdogSeller),
    ...opt('counterWatchdogDueAt', f.counterWatchdogDueAt),
    ...opt('counterWatchdogRound', f.counterWatchdogRound),
    counterScheduleVersion: f.counterScheduleVersion,
    ...opt('parkedAgreement', f.parkedAgreement),
    ...opt('latePreemptAttempted', f.latePreemptAttempted),
    escrowFunded: f.escrowFunded,
  });
}

function addressMap<V>(entries: Record<string, V>): AddressMap<string, V> {
  const m = new AddressMap<string, V>();
  for (const [k, v] of Object.entries(entries)) m.set(k, v);
  return m;
}

/// Notes back to JobState fields. The queue points at the same offer objects
/// as the offers map, as it does in a live JobState.
export function fromNotes(raw: unknown): NotesFields {
  const n = requestNotesSchema.parse(raw);
  const bids = new AddressMap<string, NotesBid>();
  for (const b of n.bids) bids.set(b.seller, { ...b, priceWei: BigInt(b.priceWei) });
  const queue = n.candidateQueue.map((s) => bids.get(s)).filter((b): b is NotesBid => !!b);
  return {
    bids,
    ...opt('directOffers', n.directOffers ? new Set(n.directOffers) : undefined),
    ...opt('withdrawnSellers', n.withdrawnSellers ? new Set(n.withdrawnSellers) : undefined),
    ...opt('pendingRevisions', n.pendingRevisions ? new Map(Object.entries(n.pendingRevisions)) : undefined),
    ...opt('collectionStartedAt', n.collectionStartedAt),
    ...opt('collectionCloseAt', n.collectionCloseAt),
    collectionScheduleVersion: n.collectionScheduleVersion,
    collectionFired: n.collectionFired,
    counterRoundsBySeller: addressMap(n.counterRoundsBySeller),
    lastCounterPriceBySeller: addressMap(n.lastCounterPriceBySeller),
    candidateQueue: queue,
    triedSellers: new AddressSet(n.triedSellers),
    ...opt('shortlistCandidates', n.shortlistCandidates),
    ...opt('shortlist', n.shortlist),
    ...opt('sellersAtLastPass', n.sellersAtLastPass ? new AddressSet(n.sellersAtLastPass) : undefined),
    lastSellerCounterBySeller: addressMap(n.lastSellerCounterBySeller),
    finalized: n.finalized,
    ...opt('negotiationEndedAt', n.negotiationEndedAt),
    ...opt('negotiationEndReason', n.negotiationEndReason),
    ...opt('counterWatchdogSeller', n.counterWatchdogSeller),
    ...opt('counterWatchdogDueAt', n.counterWatchdogDueAt),
    ...opt('counterWatchdogRound', n.counterWatchdogRound),
    counterScheduleVersion: n.counterScheduleVersion,
    ...opt('parkedAgreement', n.parkedAgreement as Parked | null | undefined),
    ...opt('latePreemptAttempted', n.latePreemptAttempted),
    escrowFunded: n.escrowFunded,
  };
}

/// What the stored request and the deal say about the request when the agent
/// picks it up. They are facts outside the agent, so they win over the notes.
export interface TerminalFacts {
  ended: boolean;
  negotiationEndedAt?: number;
  negotiationEndReason?: string;
  escrowFunded: boolean;
}

export function withTerminalFacts(fields: NotesFields, facts: TerminalFacts): NotesFields {
  const ended = fields.finalized || facts.ended || facts.escrowFunded;
  return {
    ...fields,
    finalized: ended,
    escrowFunded: fields.escrowFunded || facts.escrowFunded,
    ...(facts.negotiationEndedAt !== undefined ? { negotiationEndedAt: facts.negotiationEndedAt } : {}),
    ...(facts.negotiationEndReason !== undefined ? { negotiationEndReason: facts.negotiationEndReason } : {}),
  };
}

/// A window or a counter wait left open in the notes is armed again at its
/// own time, or now if that time has passed.
export function resumeAt(at: number | undefined, now: number): number | null {
  return at === undefined ? null : Math.max(at, now);
}
