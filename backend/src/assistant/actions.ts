/// Stage 2 of the chat-native transaction surface: the ACTION ENVELOPE. An
/// assistant reply can carry structured actions the chat UI renders as prominent
/// controls, instead of burying a link in prose. Stage 2 ships ONE variant,
/// `navigate` — route the user straight to the screen that does the thing — which
/// is also the safety contract Stage 3's confirm cards extend. Nothing here
/// executes or moves money: navigate only sends the user to a page they operate
/// themselves, with their own gates and signatures intact.
///
/// SECURITY: hrefs are built from a fixed allowlist, never free-formed by the
/// model. The model picks a `destination` key plus a couple of typed, validated
/// params; the backend builds the path. So a prompt-injected or hallucinated URL
/// (javascript:, //evil.host, /admin/...) can never reach the client — the worst
/// a bad tool call does is fail validation and return an error to the model.

export interface NavigateAction {
  kind: 'navigate';
  /// Stable id (the built href) for React keys + dedup within one reply.
  id: string;
  /// Button text. Short and specific, e.g. "Add money" or "Open the shirts deal".
  label: string;
  /// The internal path to route to. Always starts with a single '/', built from
  /// the allowlist below, so it is always a real, safe in-app route.
  href: string;
  /// Optional one short line under the button.
  description?: string;
}

/// Stage 2 has one variant. Stage 3 adds a `confirm` variant (a propose->confirm
/// card for a reversible write) to this same union; the envelope + renderer carry
/// it unchanged.
export type AssistantAction = NavigateAction;

/// The destinations the assistant may send a user to. Mirrors the route list in
/// the knowledge base; keep the two in sync. No /admin, /legacy, or any route
/// that isn't a normal user destination.
export const NAVIGATE_DESTINATIONS = [
  'home',
  'add_money',
  'withdraw_proceeds',
  'faucet',
  'new_request',
  'direct_deal',
  'new_offer',
  'market',
  'partners',
  'financier',
  'open_deal',
  'credit_passport',
  'profile',
  'activity',
  'how_it_works',
  'stake',
  'settings',
  'feedback',
] as const;
export type NavigateDestination = (typeof NAVIGATE_DESTINATIONS)[number];

interface DestSpec {
  label: string;
  /// Build the href from validated params, or null when a required param is
  /// missing/invalid (the caller turns that into an error for the model).
  build: (p: { jobId?: string; address?: string; rail?: string }) => string | null;
}

/// jobIds are on-chain-derived (0x…) or synthetic (job-…); allow only a safe
/// path-segment charset so nothing can break out of the /deals/ path.
function safeJobId(v?: string): string | null {
  return v && /^[A-Za-z0-9._-]{1,120}$/.test(v) ? v : null;
}
function safeAddress(v?: string): string | null {
  return v && /^0x[0-9a-fA-F]{40}$/.test(v) ? v.toLowerCase() : null;
}

const DESTINATIONS: Record<NavigateDestination, DestSpec> = {
  home: { label: 'Go to home', build: () => '/app' },
  // /bridge reads ?rail (gateway|cctp); anything else defaults to the pooled rail.
  add_money: { label: 'Add money', build: (p) => `/bridge?rail=${p.rail === 'cctp' ? 'cctp' : 'gateway'}` },
  withdraw_proceeds: { label: 'Withdraw proceeds', build: () => '/profile#agents' },
  faucet: { label: 'Get test USDC', build: () => '/profile' },
  new_request: { label: 'Post a request', build: () => '/buyer' },
  direct_deal: { label: 'Open a direct deal', build: () => '/buyer' },
  new_offer: { label: 'Post an offer', build: () => '/seller' },
  market: { label: 'Browse the market', build: () => '/market' },
  partners: { label: 'Find partners', build: () => '/partners' },
  financier: { label: 'Financier desk', build: () => '/financier' },
  open_deal: {
    label: 'Open the deal',
    build: (p) => {
      const j = safeJobId(p.jobId);
      return j ? `/deals/${j}` : null;
    },
  },
  credit_passport: {
    label: 'View credit passport',
    build: (p) => {
      const a = safeAddress(p.address);
      return a ? `/credit-passport/${a}` : null;
    },
  },
  profile: { label: 'Your profile', build: () => '/profile' },
  activity: { label: 'Network activity', build: () => '/activity' },
  how_it_works: { label: 'How it works', build: () => '/how-it-works' },
  stake: { label: 'Stake for reputation', build: () => '/stake' },
  settings: { label: 'Settings', build: () => '/settings' },
  feedback: { label: 'Send feedback', build: () => '/feedback' },
};

export interface BuildNavigateInput {
  destination: NavigateDestination;
  jobId?: string;
  address?: string;
  rail?: string;
  label?: string;
  description?: string;
}

/// Build a validated NavigateAction, or an `{ error }` the tool hands back to the
/// model so it can adjust (e.g. a missing jobId). Never throws.
export function buildNavigateAction(input: BuildNavigateInput): NavigateAction | { error: string } {
  const spec = DESTINATIONS[input.destination];
  if (!spec) return { error: `Unknown destination "${input.destination}".` };
  const href = spec.build({ jobId: input.jobId, address: input.address, rail: input.rail });
  if (!href) {
    const need = input.destination === 'open_deal' ? 'deal id' : 'address';
    return { error: `That destination needs a valid ${need}.` };
  }
  const label = (input.label?.trim() || spec.label).slice(0, 60);
  const description = input.description?.trim().slice(0, 120) || undefined;
  return { kind: 'navigate', id: href, label, href, description };
}
