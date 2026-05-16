import { pgTable, text, jsonb, bigint, index } from 'drizzle-orm/pg-core';
import type { UserProfile } from './profiles.js';
import type { DirectDeal } from './deals.js';
import type { AgentWallets } from './agentWallets.js';
import type { BridgeRelay } from './bridges.js';
import type { ChatMessage } from './messages.js';
import type { TelegramLink } from './telegramLinks.js';

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
