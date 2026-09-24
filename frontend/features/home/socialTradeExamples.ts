// Illustrative content shared by the landing phone and its no-network tests.
// None of these amounts or terms is passed into the real deal composer.
export const SOCIAL_TRADE_EXAMPLES = [
  { id: 'tiktok', name: 'TikTok', amount: 1240, days: 14 },
  { id: 'instagram', name: 'Instagram', amount: 2100, days: 21 },
  { id: 'facebook', name: 'Facebook', amount: 3600, days: 10 },
  { id: 'x', name: 'X', amount: 1850, days: 5 },
  { id: 'linkedin', name: 'LinkedIn', amount: 5200, days: 30 },
] as const;

export type SocialTradeId = (typeof SOCIAL_TRADE_EXAMPLES)[number]['id'];
export const SOCIAL_EXAMPLE_INTERVAL_MS = 9000;
