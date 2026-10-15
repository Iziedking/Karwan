/// The literal parts of karwan.site/developers: the scoring numbers and an
/// example read. The numbers mirror EXTERNAL_REPUTATION_PARAMS in
/// backend/src/reputation/external.ts; content.test.ts fails when they drift.

export const SCORING = {
  halfLifeDays: 365,
  referenceValueUsd: 100,
  perCounterpartyCap: 3,
  z: 1.96,
  priorWeight: 20,
  priorMean: 0.5,
  maxImportedShare: 0.15,
  importedFadeDeals: 10,
  verificationWeight: {
    partner: 1,
    official_api: 0.8,
    official_record: 0.7,
    human_reviewed: 0.65,
    user_proof: 0.6,
    self_reported: 0,
  },
} as const;

export const RECORD_READ_PRICE_USDC = '0.01';

export const RECORD_READ_EXAMPLE = {
  version: 'karwan-record-v1',
  issuer: '0x631e789f2d48068a8f17d74a28e2285ca5f7f6c6',
  subject: { tag: 'ada', address: '0x00000000000000000000000000000000000000aa' },
  level: 'work_verified',
  score: 82,
  tier: 'STRONG',
  counts: { completed: 12, onTimeRate: 92, disputesWon: 0, disputesLost: 0, cancelled: 0 },
  outcomes: [
    {
      endedAt: 1792540800,
      success: true,
      onTime: true,
      valueBand: '50to250',
      role: 'seller',
      counterparty: '0x6b1f0f3f3c0e2d4a9a0f6f7d1d6b5b2c9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b',
    },
  ],
  issuedAt: 1792627200000,
  expiresAt: 1792713600000,
  chainId: 5042002,
  signature: '0x…',
} as const;

export const ISSUER_KEY_PATH = '/.well-known/karwan-record-issuer.json';
export const READ_PATH = 'GET /api/x402/record/:subject?purpose=&ref=&for=';
