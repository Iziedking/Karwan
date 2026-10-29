/// Old trade hubs and parked pages, sent into the one market (view 17). Kept
/// temporary (307) so the destinations can still change.
export const MARKET_REDIRECTS = [
  { source: '/p2p', destination: '/market?view=yours', permanent: false },
  { source: '/b2b', destination: '/market?view=yours', permanent: false },
  { source: '/p2p/requests', destination: '/market?view=yours&list=requests', permanent: false },
  { source: '/p2p/offers', destination: '/market?view=yours&list=offers', permanent: false },
  { source: '/listings', destination: '/market', permanent: false },
  { source: '/partners', destination: '/market?scope=business', permanent: false },
  { source: '/supply', destination: '/seller', permanent: false },
  // The old onboarding page; setup replaced it (view 38).
  { source: '/onboarding', destination: '/setup', permanent: false },
];
