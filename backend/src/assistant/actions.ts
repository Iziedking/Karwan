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

/// A propose->confirm card for a write. The assistant PREPARES the action and the
/// user must tap Confirm; the frontend then calls the SAME session-gated route the
/// UI uses. The backend never executes here — it only hands back a validated
/// payload the user has to approve. Intents so far:
///   - post_offer       (Stage 3): post a standing offer. Off-chain, no funds move, cancelable.
///   - release_milestone (Stage 4): pay the seller a milestone from escrow. Real USDC,
///                        IRREVERSIBLE, so the card carries a `warning`. Still not a wallet
///                        signature: the buyer agent's Circle wallet signs on the backend, gated
///                        by the buyer's session + explicit Confirm — the human-approval invariant.
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

export interface ReleaseMilestonePayload {
  jobId: string;
  /// Always the caller's own session address (the buyer), set by the backend. The
  /// release route re-checks isSessionSelf AND caller === deal.buyer.
  caller: string;
}

export interface WithdrawPayload {
  /// Always the caller's own session address, set by the backend. The withdraw
  /// route re-checks isSessionSelf, so a tampered address can't pull someone
  /// else's funds.
  address: string;
  agent: 'buyer' | 'seller';
  toAddress: string;
  amountUsdc: number;
}

interface ConfirmActionBase {
  kind: 'confirm';
  id: string;
  /// Card heading, e.g. "Post this offer".
  title: string;
  /// One line under the heading.
  summary?: string;
  /// A stark, red-flagged line for irreversible/money-moving actions. Absent on
  /// harmless ones like post_offer.
  warning?: string;
  /// Read-only rows the card shows so the user sees exactly what will happen.
  fields: { label: string; value: string }[];
  confirmLabel?: string;
  cancelLabel?: string;
}

export interface PostOfferConfirm extends ConfirmActionBase {
  intent: 'post_offer';
  payload: PostOfferPayload;
}
export interface ReleaseConfirm extends ConfirmActionBase {
  intent: 'release_milestone';
  payload: ReleaseMilestonePayload;
}
export interface WithdrawConfirm extends ConfirmActionBase {
  intent: 'withdraw_proceeds';
  payload: WithdrawPayload;
}

/// Discriminated on `intent`, which also tells the frontend which route to call.
export type ConfirmAction = PostOfferConfirm | ReleaseConfirm | WithdrawConfirm;

/// Stage 2 shipped `navigate`; Stages 3-4 add `confirm`. The envelope + renderer
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
export function buildPostOfferConfirm(input: BuildPostOfferInput): PostOfferConfirm | { error: string } {
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

export interface BuildReleaseInput {
  /// The authenticated caller (the buyer), backend-set — never the model.
  caller: string;
  jobId: string;
  /// Display label for the seller (paytag or address).
  counterparty: string;
  /// 1-based index of the milestone being released, and the total count.
  milestoneNumber: number;
  totalMilestones: number;
  /// Pre-formatted USDC strings computed by the caller from the on-chain escrow,
  /// so this stays a pure builder with no chain/bigint math.
  amountUsdc: string;
  remainingUsdc: string;
  isFinal: boolean;
}

/// Build a release-milestone confirm card. Pure: the tool reads the escrow, does
/// the amount math, and passes formatted values in. Always carries the
/// irreversible `warning`. There is no failure path here — the tool validates
/// releasability before calling this.
export function buildReleaseConfirm(i: BuildReleaseInput): ReleaseConfirm {
  const fields: { label: string; value: string }[] = [
    { label: 'To', value: i.counterparty },
    { label: 'Milestone', value: `${i.milestoneNumber} of ${i.totalMilestones}` },
    { label: 'Releasing now', value: `${i.amountUsdc} USDC` },
    i.isFinal
      ? { label: 'After this', value: 'Deal complete' }
      : { label: 'Left in escrow', value: `${i.remainingUsdc} USDC` },
  ];
  return {
    kind: 'confirm',
    id: `release:${i.jobId}:${i.milestoneNumber}`,
    intent: 'release_milestone',
    title: i.isFinal ? 'Release the final payment' : 'Release this milestone',
    summary: `Pay the seller for milestone ${i.milestoneNumber} of ${i.totalMilestones}.`,
    warning: 'Payouts are final. This cannot be undone.',
    fields,
    payload: { jobId: i.jobId, caller: i.caller },
    confirmLabel: 'Release payment',
    cancelLabel: 'Not now',
  };
}

export interface BuildWithdrawInput {
  /// The authenticated caller, backend-set — never the model.
  caller: string;
  agent: 'buyer' | 'seller';
  toAddress: string;
  amountUsdc: number;
  /// Pre-formatted USDC string computed by the caller from the on-chain balance.
  balanceAfterUsdc: string;
}

/// Build a withdraw confirm card, or an `{ error }`. Shows the FULL destination
/// address so the user can verify it (a typo'd address loses funds). Re-validates
/// the address; the withdraw route re-checks isSessionSelf on the caller. Never throws.
export function buildWithdrawConfirm(i: BuildWithdrawInput): WithdrawConfirm | { error: string } {
  const to = i.toAddress?.trim() ?? '';
  if (!/^0x[0-9a-fA-F]{40}$/.test(to)) {
    return { error: 'That destination address is not a valid 0x address.' };
  }
  if (!(i.amountUsdc > 0)) {
    return { error: 'The withdrawal amount must be greater than 0.' };
  }
  const dest = to.toLowerCase();
  const fields: { label: string; value: string }[] = [
    { label: 'From', value: `Your ${i.agent} agent wallet` },
    { label: 'Amount', value: `${i.amountUsdc} USDC` },
    { label: 'To', value: dest },
    { label: 'Balance after', value: `${i.balanceAfterUsdc} USDC` },
  ];
  return {
    kind: 'confirm',
    id: `withdraw:${i.agent}:${dest}:${i.amountUsdc}`,
    intent: 'withdraw_proceeds',
    title: 'Withdraw USDC',
    summary: `Send ${i.amountUsdc} USDC from your ${i.agent} agent wallet on Arc.`,
    warning: 'This sends USDC to the address shown and cannot be undone. Check the address carefully.',
    fields,
    payload: { address: i.caller, agent: i.agent, toAddress: dest, amountUsdc: i.amountUsdc },
    confirmLabel: 'Withdraw',
    cancelLabel: 'Not now',
  };
}
