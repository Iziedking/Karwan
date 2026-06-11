/// Central registry of every react-query key the app uses. Every key is a
/// function returning a tuple so two call sites can never disagree on shape.
/// Group by feature and keep the outer slug stable — the SSE invalidator and
/// the persister both rely on these prefixes to invalidate broad swathes.
export const qk = {
  status: () => ['api', 'status'] as const,
  dealsStats: () => ['api', 'deals-stats'] as const,

  deals: {
    all: () => ['deals'] as const,
    list: (address: string | null | undefined) =>
      ['deals', 'list', (address ?? 'anon').toLowerCase()] as const,
    item: (jobId: string, viewer: string | null | undefined) =>
      ['deals', 'item', jobId, (viewer ?? 'anon').toLowerCase()] as const,
  },

  balances: {
    all: () => ['balances'] as const,
    me: () => ['balances', 'me'] as const,
  },

  walletOverview: (address: string) =>
    ['wallet-overview', address.toLowerCase()] as const,

  reputation: (address: string) =>
    ['reputation', address.toLowerCase()] as const,

  profile: {
    me: (address: string | null | undefined) =>
      ['profile', 'me', (address ?? 'anon').toLowerCase()] as const,
    byAddress: (address: string) =>
      ['profile', 'by-address', address.toLowerCase()] as const,
  },

  business: {
    status: (address: string | null | undefined) =>
      ['business', 'status', (address ?? 'anon').toLowerCase()] as const,
  },

  activity: {
    financeJobIds: () => ['activity', 'finance-jobids'] as const,
  },

  notifications: (address: string | null | undefined) =>
    ['notifications', (address ?? 'anon').toLowerCase()] as const,

  vault: {
    positions: (address: string) =>
      ['vault', 'positions', address.toLowerCase()] as const,
    networkStats: () => ['vault', 'network-stats'] as const,
  },

  yield: {
    protocol: () => ['yield', 'protocol'] as const,
    history: () => ['yield', 'history'] as const,
    me: (address: string) => ['yield', 'me', address.toLowerCase()] as const,
  },

  job: {
    all: () => ['job'] as const,
    snapshot: (jobId: string) => ['job', 'snapshot', jobId] as const,
    matchProposal: (jobId: string, address: string | null | undefined) =>
      ['job', 'match-proposal', jobId, (address ?? 'anon').toLowerCase()] as const,
    nearMiss: (jobId: string, address: string | null | undefined) =>
      ['job', 'near-miss', jobId, (address ?? 'anon').toLowerCase()] as const,
  },

  activation: (address: string | null | undefined) =>
    ['activation', (address ?? 'anon').toLowerCase()] as const,

  terms: (address: string | null | undefined) =>
    ['terms', (address ?? 'anon').toLowerCase()] as const,

  siwe: {
    nonce: () => ['siwe', 'nonce'] as const,
    session: () => ['siwe', 'session'] as const,
  },
};

export type QueryKey = ReturnType<
  | typeof qk.status
  | typeof qk.dealsStats
  | typeof qk.deals.list
  | typeof qk.deals.item
  | typeof qk.balances.me
  | typeof qk.walletOverview
  | typeof qk.reputation
  | typeof qk.profile.me
  | typeof qk.profile.byAddress
  | typeof qk.business.status
  | typeof qk.activity.financeJobIds
  | typeof qk.notifications
  | typeof qk.vault.positions
  | typeof qk.vault.networkStats
  | typeof qk.yield.protocol
  | typeof qk.yield.history
  | typeof qk.yield.me
  | typeof qk.job.snapshot
  | typeof qk.job.matchProposal
  | typeof qk.job.nearMiss
  | typeof qk.activation
  | typeof qk.terms
>;
