import { pgTable, text, jsonb, bigint, index, primaryKey } from 'drizzle-orm/pg-core';
import type { UserProfile } from './profiles.js';
import type { DirectDeal } from './deals.js';
import type { AgentWallets } from './agentWallets.js';
import type { BridgeRelay } from './bridges.js';
import type { ChatMessage } from './messages.js';
import type { TelegramLink } from './telegramLinks.js';
import type { MatchProposal } from './matchProposals.js';

// Profiles and direct deals keep their full TypeScript shape in a JSONB `data`
// column. A few fields are also surfaced as real columns so they can be
// indexed for lookups without unpacking the JSON.

export const profiles = pgTable('profiles', {
  address: text('address').primaryKey(),
  data: jsonb('data').$type<UserProfile>().notNull(),
});

export const directDeals = pgTable(
  'direct_deals',
  {
    jobId: text('job_id').primaryKey(),
    buyer: text('buyer').notNull(),
    seller: text('seller').notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    data: jsonb('data').$type<DirectDeal>().notNull(),
  },
  (t) => ({
    buyerIdx: index('direct_deals_buyer_idx').on(t.buyer),
    sellerIdx: index('direct_deals_seller_idx').on(t.seller),
    // ORDER BY created_at DESC powers /deals/feed and listDealsForAddress;
    // matching index direction so Postgres can serve them index-only.
    createdAtIdx: index('direct_deals_created_at_idx').on(t.createdAt),
  }),
);

export const agentWallets = pgTable('agent_wallets', {
  userAddress: text('user_address').primaryKey(),
  data: jsonb('data').$type<AgentWallets>().notNull(),
});

export const bridges = pgTable('bridges', {
  bridgeId: text('bridge_id').primaryKey(),
  data: jsonb('data').$type<BridgeRelay>().notNull(),
});

export const messages = pgTable(
  'messages',
  {
    id: text('id').primaryKey(),
    jobId: text('job_id').notNull(),
    sender: text('sender').notNull(),
    ts: bigint('ts', { mode: 'number' }).notNull(),
    data: jsonb('data').$type<ChatMessage>().notNull(),
  },
  (t) => ({
    jobIdx: index('messages_job_idx').on(t.jobId),
    // Chat replay queries one job's messages newest-first; composite makes the
    // per-job ORDER BY ts an index scan.
    jobTsIdx: index('messages_job_ts_idx').on(t.jobId, t.ts),
  }),
);

export const telegramLinks = pgTable('telegram_links', {
  address: text('address').primaryKey(),
  data: jsonb('data').$type<TelegramLink>().notNull(),
});

/// Durable event log for the bus. Replaces the flat data/events.json
/// fallback when DATABASE_URL is set — survives container restarts and
/// accidental file ops. PK matches the bus dedupe shape (type|jobId|ts)
/// so re-injects from the chain backfill / bridge sync are no-ops at the
/// DB layer too. JSON `data` column keeps the full KarwanEvent payload so
/// the bus can deserialize without a column-by-column schema dance.
export const eventHistory = pgTable(
  'event_history',
  {
    type: text('type').notNull(),
    /// Coalesced empty string when KarwanEvent.jobId is undefined — keeps
    /// the composite PK well-formed without a nullable jobId.
    jobId: text('job_id').notNull(),
    ts: bigint('ts', { mode: 'number' }).notNull(),
    data: jsonb('data').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.type, t.jobId, t.ts] }),
    /// recent(limit) reads ORDER BY ts DESC — index it.
    tsIdx: index('event_history_ts_idx').on(t.ts),
    /// recent(limit, jobId) needs per-job lookups; cheap with this index.
    jobTsIdx: index('event_history_job_ts_idx').on(t.jobId, t.ts),
  }),
);

// Agent-proposed match awaiting human approval. Indexed by buyer + seller
// user address so the proposal list endpoints stay fast as the table grows.
export const matchProposals = pgTable(
  'match_proposals',
  {
    jobId: text('job_id').primaryKey(),
    buyerUser: text('buyer_user').notNull(),
    sellerUser: text('seller_user').notNull(),
    proposedAt: bigint('proposed_at', { mode: 'number' }).notNull(),
    data: jsonb('data').$type<MatchProposal>().notNull(),
  },
  (t) => ({
    buyerUserIdx: index('match_proposals_buyer_user_idx').on(t.buyerUser),
    sellerUserIdx: index('match_proposals_seller_user_idx').on(t.sellerUser),
    proposedAtIdx: index('match_proposals_proposed_at_idx').on(t.proposedAt),
  }),
);
