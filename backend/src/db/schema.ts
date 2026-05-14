import { pgTable, text, jsonb, bigint, index } from 'drizzle-orm/pg-core';
import type { UserProfile } from './profiles.js';
import type { DirectDeal } from './deals.js';
import type { AgentWallets } from './agentWallets.js';

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
  }),
);

export const agentWallets = pgTable('agent_wallets', {
  userAddress: text('user_address').primaryKey(),
  data: jsonb('data').$type<AgentWallets>().notNull(),
});
