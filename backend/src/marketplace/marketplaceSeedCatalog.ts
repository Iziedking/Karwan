export type MarketplaceSeedRequest = {
  seedKey: string;
  kind: 'request';
  brief: string;
  budgetUsdc: number;
  deadlineDays: number;
};

export type MarketplaceSeedOffer = {
  seedKey: string;
  kind: 'offer';
  title: string;
  description: string;
  askingPriceUsdc: number;
  ttlDays: number;
};

export type MarketplaceSeedItem = MarketplaceSeedRequest | MarketplaceSeedOffer;

/**
 * Operator-created market inventory. These are inputs for the real creation
 * paths, not fallback content for the frontend. The market remains empty until
 * an operator applies this catalog and the resulting records have a real
 * on-chain job id or durable listing id.
 */
export const MARKETPLACE_SEED_CATALOG: readonly MarketplaceSeedItem[] = [
  {
    seedKey: 'request-lagos-product-photography',
    kind: 'request',
    brief: 'Product photography for a Lagos skincare launch, ten edited images delivered in five days.',
    budgetUsdc: 45,
    deadlineDays: 7,
  },
  {
    seedKey: 'request-nairobi-bookkeeping',
    kind: 'request',
    brief: 'Monthly bookkeeping cleanup for a Nairobi retail business, with a clear reconciliation report.',
    budgetUsdc: 60,
    deadlineDays: 10,
  },
  {
    seedKey: 'request-accra-brand-identity',
    kind: 'request',
    brief: 'Brand identity refresh for an Accra food company, including logo direction and a small usage guide.',
    budgetUsdc: 85,
    deadlineDays: 14,
  },
  {
    seedKey: 'request-cairo-translation',
    kind: 'request',
    brief: 'Translate an English product catalogue into Arabic for a Cairo distributor, preserving the layout.',
    budgetUsdc: 35,
    deadlineDays: 5,
  },
  {
    seedKey: 'request-kampala-web-audit',
    kind: 'request',
    brief: 'Accessibility and performance audit for a Kampala services website, with prioritised fixes.',
    budgetUsdc: 50,
    deadlineDays: 8,
  },
  {
    seedKey: 'request-london-api-integration',
    kind: 'request',
    brief: 'Integrate a payments API for a London software team and provide a tested handover.',
    budgetUsdc: 120,
    deadlineDays: 21,
  },
  {
    seedKey: 'request-remote-customer-research',
    kind: 'request',
    brief: 'Remote customer interviews for a cross-border marketplace, with ten recordings and a findings brief.',
    budgetUsdc: 90,
    deadlineDays: 18,
  },
  {
    seedKey: 'request-abuja-contract-review',
    kind: 'request',
    brief: 'Plain-language review of a vendor agreement for an Abuja startup before it is signed.',
    budgetUsdc: 75,
    deadlineDays: 6,
  },
  {
    seedKey: 'request-dar-es-salaam-logistics-plan',
    kind: 'request',
    brief: 'Delivery route and cost plan for moving packaged goods from Dar es Salaam to Kigali.',
    budgetUsdc: 55,
    deadlineDays: 9,
  },
  {
    seedKey: 'request-global-technical-writer',
    kind: 'request',
    brief: 'Technical writer for developer documentation, starting with an API quickstart and two examples.',
    budgetUsdc: 100,
    deadlineDays: 15,
  },
  {
    seedKey: 'request-cape-town-video-edit',
    kind: 'request',
    brief: 'Edit three short product videos for a Cape Town launch, formatted for web and mobile.',
    budgetUsdc: 70,
    deadlineDays: 12,
  },
  {
    seedKey: 'request-paris-localisation',
    kind: 'request',
    brief: 'Localise a small SaaS onboarding flow for French-speaking customers in Paris and Montreal.',
    budgetUsdc: 65,
    deadlineDays: 10,
  },
  {
    seedKey: 'offer-lagos-design-studio',
    kind: 'offer',
    title: 'Product photography for growing brands',
    description: 'Studio and on-location product photography with edited web-ready images in Lagos.',
    askingPriceUsdc: 45,
    ttlDays: 30,
  },
  {
    seedKey: 'offer-nairobi-finance-operator',
    kind: 'offer',
    title: 'Bookkeeping and reconciliation',
    description: 'Clean monthly books, reconcile transactions, and return a practical finance summary.',
    askingPriceUsdc: 60,
    ttlDays: 30,
  },
  {
    seedKey: 'offer-accra-brand-designer',
    kind: 'offer',
    title: 'Brand identity and launch systems',
    description: 'A focused brand refresh for small businesses that need a clear identity they can use.',
    askingPriceUsdc: 85,
    ttlDays: 30,
  },
  {
    seedKey: 'offer-cairo-arabic-localisation',
    kind: 'offer',
    title: 'Arabic translation and localisation',
    description: 'Human translation and layout-aware localisation for catalogues, websites, and product copy.',
    askingPriceUsdc: 35,
    ttlDays: 30,
  },
  {
    seedKey: 'offer-kampala-web-quality',
    kind: 'offer',
    title: 'Website accessibility and speed review',
    description: 'A concise audit that identifies the biggest accessibility and performance improvements.',
    askingPriceUsdc: 50,
    ttlDays: 30,
  },
  {
    seedKey: 'offer-remote-api-engineer',
    kind: 'offer',
    title: 'API integrations for software teams',
    description: 'Reliable API integrations with tests, clear documentation, and a clean handover.',
    askingPriceUsdc: 120,
    ttlDays: 30,
  },
  {
    seedKey: 'offer-global-researcher',
    kind: 'offer',
    title: 'Customer research and insight briefs',
    description: 'Remote interviews and structured findings to help teams make their next product decision.',
    askingPriceUsdc: 90,
    ttlDays: 30,
  },
  {
    seedKey: 'offer-cross-border-operations',
    kind: 'offer',
    title: 'Cross-border operations planning',
    description: 'Practical logistics, vendor, and delivery planning for local and international trade.',
    askingPriceUsdc: 75,
    ttlDays: 30,
  },
  {
    seedKey: 'offer-cape-town-video-editor',
    kind: 'offer',
    title: 'Short-form product video editing',
    description: 'Clean edits for product launches, with exports sized for websites and social feeds.',
    askingPriceUsdc: 70,
    ttlDays: 30,
  },
  {
    seedKey: 'offer-paris-french-localisation',
    kind: 'offer',
    title: 'French product localisation',
    description: 'Natural French copy adaptation for SaaS onboarding, websites, and customer journeys.',
    askingPriceUsdc: 65,
    ttlDays: 30,
  },
  {
    seedKey: 'offer-kigali-trade-logistics',
    kind: 'offer',
    title: 'Regional delivery planning',
    description: 'Route, vendor, and delivery planning for East African regional trade.',
    askingPriceUsdc: 55,
    ttlDays: 30,
  },
  {
    seedKey: 'offer-global-technical-writer',
    kind: 'offer',
    title: 'Developer documentation and examples',
    description: 'Clear API guides and examples that help customers move from setup to first result.',
    askingPriceUsdc: 100,
    ttlDays: 30,
  },
];

export function selectMarketplaceSeedItems(
  kind: 'request' | 'offer' | 'all',
  limit: number | undefined,
): MarketplaceSeedItem[] {
  const filtered = MARKETPLACE_SEED_CATALOG.filter((item) => kind === 'all' || item.kind === kind);
  return limit === undefined ? [...filtered] : filtered.slice(0, limit);
}
