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

/// A propose->confirm card for a reversible write. The assistant PREPARES the
/// action and the user must tap Confirm; the frontend then calls the SAME
/// session-gated route the UI uses. The backend never executes here — it only
/// hands back a validated payload the user has to approve. Stage 3 ships one
/// intent, `post_offer` (post a standing offer; off-chain, no funds move, fully
/// cancelable). Later intents (post_request, fund, release, ...) extend `intent`
/// and `ConfirmPayload` on this same shape.
export interface PostOfferPayload {
  /// Always the caller's own session address, set by the backend, never the
  /// model. The listings route re-checks isSessionSelf, so a tampered payload
  /// still can't post as anyone else.
  sellerUser: string;
  title: string;
  description: string;
  askingPriceUsdc: number;
  negotiationMaxDecreasePct?: number;
  ttlDays?: number;
}

export interface ConfirmAction {
  kind: 'confirm';
  id: string;
  /// Discriminates which existing route the frontend calls on confirm.
  intent: 'post_offer';
  /// Card heading, e.g. "Post this offer".
  title: string;
  /// One line under the heading (here, the offer description).
  summary?: string;
  /// Read-only rows the card shows so the user sees exactly what will happen.
  fields: { label: string; value: string }[];
  /// The validated body passed to the intent's route on confirm.
  payload: PostOfferPayload;
  confirmLabel?: string;
  cancelLabel?: string;
}

/// Stage 2 shipped `navigate`; Stage 3 adds `confirm`. The envelope + renderer
/// carry the union unchanged as new variants land.
export type AssistantAction = NavigateAction | ConfirmAction;

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

export interface BuildPostOfferInput {
  /// The authenticated caller. The backend passes the session address; the model
  /// never supplies this, so the offer always posts as the signed-in user.
  caller: string;
  title: string;
  description: string;
  askingPriceUsdc: number;
  negotiationMaxDecreasePct?: number;
  ttlDays?: number;
}

/// Build a validated post-offer confirm card, or an `{ error }` the tool hands
/// back to the model so it can fix the inputs. Ranges MIRROR the listings route's
/// createSchema (title 3-120, description 5-500, price >0 and <=5,000,000, pct
/// 0-50, ttl ~1min-90d); the route re-validates on confirm, so this is a friendly
/// first pass, not the security boundary. Never throws.
export function buildPostOfferConfirm(input: BuildPostOfferInput): ConfirmAction | { error: string } {
  const title = input.title?.trim() ?? '';
  const description = input.description?.trim() ?? '';
  if (title.length < 3 || title.length > 120) {
    return { error: 'The offer title must be between 3 and 120 characters.' };
  }
  if (description.length < 5 || description.length > 500) {
    return { error: 'The offer description must be between 5 and 500 characters.' };
  }
  if (!(input.askingPriceUsdc > 0) || input.askingPriceUsdc > 5_000_000) {
    return { error: 'The asking price must be greater than 0 and at most 5,000,000 USDC.' };
  }
  const pct = input.negotiationMaxDecreasePct;
  if (pct !== undefined && (pct < 0 || pct > 50)) {
    return { error: 'The negotiation flexibility must be between 0 and 50 percent.' };
  }
  const ttl = input.ttlDays;
  if (ttl !== undefined && (ttl < 0.0006 || ttl > 90)) {
    return { error: 'The listing window must be between about a minute and 90 days.' };
  }

  const fields: { label: string; value: string }[] = [
    { label: 'Title', value: title },
    { label: 'Asking price', value: `${input.askingPriceUsdc} USDC` },
  ];
  if (pct !== undefined) fields.push({ label: 'Auto-negotiate', value: `down to ${pct}% below asking` });
  if (ttl !== undefined) {
    fields.push({ label: 'Open for', value: ttl >= 1 ? `${ttl} day${ttl === 1 ? '' : 's'}` : `${Math.round(ttl * 24 * 60)} min` });
  }

  const payload: PostOfferPayload = {
    sellerUser: input.caller,
    title,
    description,
    askingPriceUsdc: input.askingPriceUsdc,
    ...(pct !== undefined ? { negotiationMaxDecreasePct: pct } : {}),
    ...(ttl !== undefined ? { ttlDays: ttl } : {}),
  };

  return {
    kind: 'confirm',
    id: `post_offer:${title.toLowerCase().slice(0, 40)}:${input.askingPriceUsdc}`,
    intent: 'post_offer',
    title: 'Post this offer',
    summary: description,
    fields,
    payload,
    confirmLabel: 'Post offer',
    cancelLabel: 'Not now',
  };
}
