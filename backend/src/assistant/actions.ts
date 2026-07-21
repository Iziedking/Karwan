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

export interface PostRequestPayload {
  /// Always the caller's own session address, set by the backend, never the
  /// model. The jobs route re-checks isSessionSelf, so a tampered payload still
  /// can't post as anyone else. This is the poster (buyer) user address.
  posterAddress: string;
  brief: string;
  budgetUsdc: number;
  deadlineDays: number;
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

export interface CashOutPayload {
  /// Always the caller's own session address, set by the backend. The bridge-out
  /// route re-checks isSessionSelf. sourceKind 'identity' means the backend burns
  /// from the user's Arc identity DCW — only offered to Circle accounts (web3
  /// users sign their own Arc burn on the bridge screen).
  address: string;
  destChainKey: string;
  amountUsdc: number;
  recipient: string;
  sourceKind: 'identity';
  /// Which rail carries it, chosen by the backend from where the money sits.
  /// 'wallet' burns on Arc via CCTP; 'unified' spends the Gateway balance, which
  /// lands in under a second. The user is never asked and never told: both are
  /// "cash out" and both arrive at the same address on the same chain.
  route: MoneyRoute;
}

/// The deal- and job-lifecycle intents. Every one of these routes re-checks
/// that the session IS `caller`, and all are backend-signed from Circle DCWs
/// for EVERY account type (the agent wallets are DCWs even for web3 users), so
/// the assistant can carry a user through a whole deal without a wallet popup.
export interface ApproveMatchPayload {
  jobId: string;
  caller: string;
}
export interface DeclineMatchPayload {
  jobId: string;
  caller: string;
  reason?: string;
}
export interface AcceptDealPayload {
  jobId: string;
  caller: string;
}
export interface MarkDeliveredPayload {
  jobId: string;
  caller: string;
  deliveryProof?: string;
}
export interface CancelRequestPayload {
  jobId: string;
  caller: string;
}
export interface CancelListingPayload {
  listingId: string;
  caller: string;
}

/// Staking and yield are Circle-account only: they move the user's IDENTITY
/// wallet, which web3 users self-custody. The tools gate on `method` before
/// building either card.
export interface StakePayload {
  address: string;
  amountUsdc: number;
}
export interface ClaimYieldPayload {
  address: string;
}
/// Which of the user's two pockets a move comes out of. Backend-chosen from the
/// live balances, never model-chosen and never surfaced: the product presents
/// one wallet and one balance, and this decides the plumbing behind it.
export type MoneyRoute = 'wallet' | 'unified';

export interface FundAgentPayload {
  address: string;
  agent: 'buyer' | 'seller';
  amountUsdc: number;
  route: MoneyRoute;
}

export interface TopUpPayload {
  /// Always the caller's own session address, set by the backend. The
  /// circle-bridge route re-checks isSessionSelf. The burn is signed from the
  /// user's own source-chain Circle DCW (their deposit wallet), so this only
  /// moves USDC that already sits in a wallet Karwan holds for them — never
  /// funds from an outside wallet, which the backend cannot touch.
  address: string;
  sourceChainKey: string;
  amountUsdc: number;
  mintRecipient: string;
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
export interface PostRequestConfirm extends ConfirmActionBase {
  intent: 'post_request';
  payload: PostRequestPayload;
}
export interface ReleaseConfirm extends ConfirmActionBase {
  intent: 'release_milestone';
  payload: ReleaseMilestonePayload;
}
export interface WithdrawConfirm extends ConfirmActionBase {
  intent: 'withdraw_proceeds';
  payload: WithdrawPayload;
}
export interface CashOutConfirm extends ConfirmActionBase {
  intent: 'cash_out';
  payload: CashOutPayload;
}
export interface TopUpConfirm extends ConfirmActionBase {
  intent: 'top_up_to_arc';
  payload: TopUpPayload;
}
export interface ApproveMatchConfirm extends ConfirmActionBase {
  intent: 'approve_match';
  payload: ApproveMatchPayload;
}
export interface DeclineMatchConfirm extends ConfirmActionBase {
  intent: 'decline_match';
  payload: DeclineMatchPayload;
}
export interface AcceptDealConfirm extends ConfirmActionBase {
  intent: 'accept_deal';
  payload: AcceptDealPayload;
}
export interface MarkDeliveredConfirm extends ConfirmActionBase {
  intent: 'mark_delivered';
  payload: MarkDeliveredPayload;
}
export interface CancelRequestConfirm extends ConfirmActionBase {
  intent: 'cancel_request';
  payload: CancelRequestPayload;
}
export interface CancelListingConfirm extends ConfirmActionBase {
  intent: 'cancel_listing';
  payload: CancelListingPayload;
}
export interface StakeConfirm extends ConfirmActionBase {
  intent: 'stake_usdc';
  payload: StakePayload;
}
export interface ClaimYieldConfirm extends ConfirmActionBase {
  intent: 'claim_yield';
  payload: ClaimYieldPayload;
}
export interface FundAgentConfirm extends ConfirmActionBase {
  intent: 'fund_agent';
  payload: FundAgentPayload;
}

/// Discriminated on `intent`, which also tells the frontend which route to call.
export type ConfirmAction =
  | PostOfferConfirm
  | PostRequestConfirm
  | ReleaseConfirm
  | WithdrawConfirm
  | CashOutConfirm
  | TopUpConfirm
  | ApproveMatchConfirm
  | DeclineMatchConfirm
  | AcceptDealConfirm
  | MarkDeliveredConfirm
  | CancelRequestConfirm
  | CancelListingConfirm
  | StakeConfirm
  | ClaimYieldConfirm
  | FundAgentConfirm;

/// Stage 2 shipped `navigate`; Stages 3-4 add `confirm`. The envelope + renderer
/// carry the union unchanged as new variants land.
export type AssistantAction = NavigateAction | ConfirmAction;

/// The destinations the assistant may send a user to. Mirrors the route list in
/// the knowledge base; keep the two in sync. No /admin, /legacy, or any route
/// that isn't a normal user destination.
export const NAVIGATE_DESTINATIONS = [
  'home',
  'add_money',
  'cash_out',
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
  // /bridge is the Top up AND Withdraw (cash out) screen. Used to route web3 users
  // to sign their own Arc burn, since the backend can't sign for their EOA.
  cash_out: { label: 'Cash out', build: () => '/bridge' },
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

/// Uniqueness suffix for confirm-card ids. The frontend keeps a durable
/// done/dismissed store keyed by id, so two SEPARATELY proposed actions must
/// never share one — a second "add 100 USDC" card with a reused id would mount
/// pre-completed, show the old receipt, and never execute (or render nothing at
/// all if the first was dismissed). Within-reply dedupe compares intent+payload
/// instead (hasEquivalentConfirm below).
function confirmNonce(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 46_656).toString(36)}`;
}

/// True when this reply already carries an equivalent confirm action (same
/// intent, identical payload) — the model called the same tool twice in one
/// turn. Ids can't be compared for this any more because each carries a nonce.
export function hasEquivalentConfirm(actions: AssistantAction[], candidate: ConfirmAction): boolean {
  return actions.some(
    (a) =>
      a.kind === 'confirm' &&
      a.intent === candidate.intent &&
      JSON.stringify(a.payload) === JSON.stringify(candidate.payload),
  );
}

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
    id: `post_offer:${title.toLowerCase().slice(0, 40)}:${input.askingPriceUsdc}:${confirmNonce()}`,
    intent: 'post_offer',
    title: 'Post this offer',
    summary: description,
    fields,
    payload,
    confirmLabel: 'Post offer',
    cancelLabel: 'Not now',
  };
}

export interface BuildPostRequestInput {
  /// The authenticated caller (the buyer). The backend passes the session
  /// address; the model never supplies this, so the request always posts as the
  /// signed-in user. The jobs route re-checks isSessionSelf.
  caller: string;
  brief: string;
  budgetUsdc: number;
  deadlineDays: number;
  /// Optional human label for the deadline row, e.g. "by 2026-07-22". Set by the
  /// tool when the user gave a calendar date, so the card echoes the date the
  /// server resolved rather than a fractional day count. Falls back to a
  /// days-from-now string.
  deadlineLabel?: string;
}

/// Build a post-request (buyer desk) confirm card, or an `{ error }` the tool
/// hands back to the model. This is the agent-mediated path: the user posts what
/// they need and their buyer agent runs the auction — matches candidates, scores
/// them on skill + reputation, and brings proposals back to approve. Posting is
/// an on-chain write signed by the buyer agent; it does NOT spend the budget
/// (funds stay in the buyer agent until the user approves a match), so no stark
/// warning. Ranges mirror the jobs route (brief 5-1000, budget >0 and
/// <=5,000,000, deadline ~1min-90d); the route re-validates on confirm and also
/// requires an activated buyer profile + a funded buyer agent. Never throws.
export function buildPostRequestConfirm(
  i: BuildPostRequestInput,
): PostRequestConfirm | { error: string } {
  const brief = i.brief?.trim() ?? '';
  // 500 mirrors the jobs route's brief cap — a longer brief would pass here
  // and then 400 at Confirm.
  if (brief.length < 5 || brief.length > 500) {
    return { error: 'The request needs a short description between 5 and 500 characters.' };
  }
  if (!(i.budgetUsdc > 0) || i.budgetUsdc > 5_000_000) {
    return { error: 'The budget must be greater than 0 and at most 5,000,000 USDC.' };
  }
  if (!(i.deadlineDays > 0) || i.deadlineDays > 90) {
    return { error: 'The deadline must be between about a minute and 90 days.' };
  }
  const days = i.deadlineDays;
  const roundedDays = Math.round(days);
  const deadlineLabel =
    i.deadlineLabel ??
    (days >= 1 ? `${roundedDays} day${roundedDays === 1 ? '' : 's'}` : `${Math.round(days * 24 * 60)} min`);
  const fields: { label: string; value: string }[] = [
    { label: 'You need', value: brief.length > 140 ? `${brief.slice(0, 137)}…` : brief },
    { label: 'Budget', value: `${i.budgetUsdc} USDC` },
    { label: 'Deadline', value: deadlineLabel },
    { label: 'Matching', value: 'Your agent finds and scores developers' },
  ];
  return {
    kind: 'confirm',
    id: `post_request:${brief.toLowerCase().slice(0, 40)}:${i.budgetUsdc}:${confirmNonce()}`,
    intent: 'post_request',
    title: 'Post this request',
    summary: 'Your buyer agent runs the auction: it matches developers, scores them on skill and reputation, and brings you proposals to approve. Nothing is paid until you approve a match.',
    fields,
    payload: { posterAddress: i.caller, brief, budgetUsdc: i.budgetUsdc, deadlineDays: i.deadlineDays },
    confirmLabel: 'Post request',
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
    id: `release:${i.jobId}:${i.milestoneNumber}:${confirmNonce()}`,
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
    id: `withdraw:${i.agent}:${dest}:${i.amountUsdc}:${confirmNonce()}`,
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

export interface BuildCashOutInput {
  /// The authenticated caller, backend-set — never the model.
  caller: string;
  /// The CCTP chain key the bridge-out route expects (e.g. 'baseSepolia').
  destChainKey: string;
  /// Human chain name for the card (e.g. 'Base').
  destChainLabel: string;
  recipient: string;
  amountUsdc: number;
  /// Pre-formatted USDC string computed by the caller from the on-chain balance.
  balanceAfterUsdc: string;
  /// Backend-chosen rail. 'unified' settles in under a second, 'wallet' takes the
  /// CCTP path. Never shown on the card: the user asked to cash out, not to pick
  /// a bridge.
  route: MoneyRoute;
}

/// Build a cash-out (bridge-out) confirm card, or an `{ error }`. Shows the FULL
/// destination address + chain so the user can verify. Backend-signed via the
/// bridge-out route (identity source), so the tool only offers this to Circle
/// accounts. Never throws.
export function buildCashOutConfirm(i: BuildCashOutInput): CashOutConfirm | { error: string } {
  const to = i.recipient?.trim() ?? '';
  // Solana recipients are base58 (case-sensitive — do NOT lowercase); EVM are 0x.
  const isSolana = i.destChainKey === 'solanaDevnet';
  if (isSolana) {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(to)) {
      return { error: 'That is not a valid Solana address.' };
    }
  } else if (!/^0x[0-9a-fA-F]{40}$/.test(to)) {
    return { error: 'That destination address is not a valid 0x address.' };
  }
  if (!(i.amountUsdc > 0)) {
    return { error: 'The cash-out amount must be greater than 0.' };
  }
  const dest = isSolana ? to : to.toLowerCase();
  const fields: { label: string; value: string }[] = [
    { label: 'Amount', value: `${i.amountUsdc} USDC` },
    { label: 'To chain', value: i.destChainLabel },
    { label: 'To address', value: dest },
    { label: 'Balance after', value: `${i.balanceAfterUsdc} USDC` },
  ];
  return {
    kind: 'confirm',
    id: `cash_out:${i.destChainKey}:${dest}:${i.amountUsdc}:${confirmNonce()}`,
    intent: 'cash_out',
    title: 'Cash out to another chain',
    summary: `Send ${i.amountUsdc} USDC from your wallet to ${i.destChainLabel}.`,
    warning: 'This sends USDC to another chain and cannot be undone. Check the address and chain.',
    fields,
    payload: {
      address: i.caller,
      destChainKey: i.destChainKey,
      amountUsdc: i.amountUsdc,
      recipient: dest,
      sourceKind: 'identity',
      route: i.route,
    },
    confirmLabel: 'Cash out',
    cancelLabel: 'Not now',
  };
}

/// Build a top-up confirm card: bridge USDC that is already sitting in the
/// user's own source-chain deposit wallet (a Circle DCW Karwan holds for them)
/// over to Arc. Fully backend-signed, so a Circle account never touches a
/// wallet popup. The caller must have verified the deposit wallet actually
/// holds the amount — this only formats the card. Never throws.
export function buildTopUpConfirm(i: {
  caller: string;
  sourceChainKey: string;
  sourceChainLabel: string;
  amountUsdc: number;
  /// Where the USDC lands on Arc. The user's own Arc address, or one of their
  /// agent wallets when they asked to fund an agent in the same step.
  mintRecipient: string;
  destinationLabel: string;
}): TopUpConfirm | { error: string } {
  if (!(i.amountUsdc > 0)) return { error: 'The amount must be greater than 0.' };
  if (!/^0x[0-9a-fA-F]{40}$/.test(i.mintRecipient)) {
    return { error: 'The Arc destination address is not valid.' };
  }
  return {
    kind: 'confirm',
    id: `top_up_to_arc:${i.sourceChainKey}:${i.amountUsdc}:${confirmNonce()}`,
    intent: 'top_up_to_arc',
    title: `Move ${i.amountUsdc} USDC to Arc`,
    summary: `Bring ${i.amountUsdc} USDC from your ${i.sourceChainLabel} wallet over to Arc. I sign it for you.`,
    fields: [
      { label: 'Amount', value: `${i.amountUsdc} USDC` },
      { label: 'From', value: `Your ${i.sourceChainLabel} wallet` },
      { label: 'To', value: i.destinationLabel },
      { label: 'Takes', value: 'A few minutes' },
    ],
    payload: {
      address: i.caller,
      sourceChainKey: i.sourceChainKey,
      amountUsdc: i.amountUsdc,
      mintRecipient: i.mintRecipient.toLowerCase(),
    },
    confirmLabel: 'Move to Arc',
    cancelLabel: 'Not now',
  };
}

/// Approve the match the user's agent negotiated. This FUNDS the escrow, so it
/// spends real money and carries the stark warning. Never throws.
export function buildApproveMatchConfirm(i: {
  caller: string;
  jobId: string;
  counterpartyLabel: string;
  priceUsdc: string;
  fundedAmountUsdc?: string;
  deadlineLabel: string;
}): ApproveMatchConfirm | { error: string } {
  if (!i.jobId) return { error: 'Missing the job id for the match.' };
  const fields = [
    { label: 'Price', value: `${i.priceUsdc} USDC` },
    { label: 'Counterparty', value: i.counterpartyLabel },
    { label: 'Deadline', value: i.deadlineLabel },
  ];
  if (i.fundedAmountUsdc) {
    fields.push({ label: 'Escrow pulls', value: `${i.fundedAmountUsdc} USDC` });
  }
  return {
    kind: 'confirm',
    id: `approve_match:${i.jobId}:${confirmNonce()}`,
    intent: 'approve_match',
    title: 'Approve this match',
    summary: `Accept ${i.counterpartyLabel} at ${i.priceUsdc} USDC and start the deal.`,
    warning: 'This funds the escrow from your buyer agent. The money is committed until the work is delivered or the deal is cancelled.',
    fields,
    payload: { jobId: i.jobId, caller: i.caller },
    confirmLabel: 'Approve and fund',
    cancelLabel: 'Not now',
  };
}

/// Decline the proposed match. No money moves; the agent keeps looking.
export function buildDeclineMatchConfirm(i: {
  caller: string;
  jobId: string;
  counterpartyLabel: string;
  priceUsdc: string;
  reason?: string;
}): DeclineMatchConfirm | { error: string } {
  if (!i.jobId) return { error: 'Missing the job id for the match.' };
  return {
    kind: 'confirm',
    id: `decline_match:${i.jobId}:${confirmNonce()}`,
    intent: 'decline_match',
    title: 'Decline this match',
    summary: `Turn down ${i.counterpartyLabel} at ${i.priceUsdc} USDC. Nothing is charged and your agent keeps looking.`,
    fields: [
      { label: 'Price', value: `${i.priceUsdc} USDC` },
      { label: 'Counterparty', value: i.counterpartyLabel },
      ...(i.reason ? [{ label: 'Reason', value: i.reason }] : []),
    ],
    payload: {
      jobId: i.jobId,
      caller: i.caller,
      ...(i.reason ? { reason: i.reason } : {}),
    },
    confirmLabel: 'Decline',
    cancelLabel: 'Keep it open',
  };
}

/// Seller accepts a direct deal. The backend funds the escrow and calls
/// acceptEscrow, which RESERVES part of their stake against the deal.
export function buildAcceptDealConfirm(i: {
  caller: string;
  jobId: string;
  amountUsdc: string;
  counterpartyLabel: string;
  deadlineLabel: string;
}): AcceptDealConfirm | { error: string } {
  if (!i.jobId) return { error: 'Missing the deal id.' };
  return {
    kind: 'confirm',
    id: `accept_deal:${i.jobId}:${confirmNonce()}`,
    intent: 'accept_deal',
    title: 'Accept this deal',
    summary: `Take on ${i.counterpartyLabel}'s ${i.amountUsdc} USDC deal and start the clock.`,
    warning: 'Accepting reserves part of your stake against this deal and commits you to the deadline. Missing it lets the buyer reclaim, which costs reputation.',
    fields: [
      { label: 'Amount', value: `${i.amountUsdc} USDC` },
      { label: 'Buyer', value: i.counterpartyLabel },
      { label: 'Deliver by', value: i.deadlineLabel },
    ],
    payload: { jobId: i.jobId, caller: i.caller },
    confirmLabel: 'Accept deal',
    cancelLabel: 'Not now',
  };
}

/// Seller marks the work delivered, which starts the buyer's review window.
export function buildMarkDeliveredConfirm(i: {
  caller: string;
  jobId: string;
  amountUsdc: string;
  deliveryProof?: string;
}): MarkDeliveredConfirm | { error: string } {
  if (!i.jobId) return { error: 'Missing the deal id.' };
  return {
    kind: 'confirm',
    id: `mark_delivered:${i.jobId}:${confirmNonce()}`,
    intent: 'mark_delivered',
    title: 'Mark as delivered',
    summary: `Tell the buyer the work on this ${i.amountUsdc} USDC deal is done. Their review window starts now.`,
    fields: [
      { label: 'Deal', value: i.jobId.slice(0, 10) },
      { label: 'Amount', value: `${i.amountUsdc} USDC` },
      ...(i.deliveryProof ? [{ label: 'Note to buyer', value: i.deliveryProof }] : []),
    ],
    payload: {
      jobId: i.jobId,
      caller: i.caller,
      ...(i.deliveryProof ? { deliveryProof: i.deliveryProof } : {}),
    },
    confirmLabel: 'Mark delivered',
    cancelLabel: 'Not yet',
  };
}

/// Cancel an open request (buyer brief) that has not matched yet.
export function buildCancelRequestConfirm(i: {
  caller: string;
  jobId: string;
  budgetUsdc: string;
}): CancelRequestConfirm | { error: string } {
  if (!i.jobId) return { error: 'Missing the request id.' };
  return {
    kind: 'confirm',
    id: `cancel_request:${i.jobId}:${confirmNonce()}`,
    intent: 'cancel_request',
    title: 'Cancel this request',
    summary: 'Take your request off the market. Your agent stops bidding on it.',
    fields: [
      { label: 'Request', value: i.jobId.slice(0, 10) },
      { label: 'Budget', value: `${i.budgetUsdc} USDC` },
    ],
    payload: { jobId: i.jobId, caller: i.caller },
    confirmLabel: 'Cancel request',
    cancelLabel: 'Keep it live',
  };
}

/// Cancel a live listing (seller offer).
export function buildCancelListingConfirm(i: {
  caller: string;
  listingId: string;
  title: string;
}): CancelListingConfirm | { error: string } {
  if (!i.listingId) return { error: 'Missing the offer id.' };
  return {
    kind: 'confirm',
    id: `cancel_listing:${i.listingId}:${confirmNonce()}`,
    intent: 'cancel_listing',
    title: 'Take down this offer',
    summary: 'Remove your offer from the market. You can post it again any time.',
    fields: [{ label: 'Offer', value: i.title }],
    payload: { listingId: i.listingId, caller: i.caller },
    confirmLabel: 'Take it down',
    cancelLabel: 'Leave it up',
  };
}

/// Stake USDC into the vault. Locks the money behind a cooldown, so it warns.
export function buildStakeConfirm(i: {
  caller: string;
  amountUsdc: number;
  walletAfterUsdc: string;
  cooldownLabel: string;
}): StakeConfirm | { error: string } {
  if (!(i.amountUsdc > 0)) return { error: 'The stake amount must be greater than 0.' };
  return {
    kind: 'confirm',
    id: `stake_usdc:${i.amountUsdc}:${confirmNonce()}`,
    intent: 'stake_usdc',
    title: 'Stake USDC',
    summary: `Lock ${i.amountUsdc} USDC in the stake vault to earn yield and build reputation.`,
    warning: `Staked USDC is not instantly spendable. Unstaking takes a ${i.cooldownLabel} cooldown, and stake reserved against an open deal cannot be withdrawn until that deal settles.`,
    fields: [
      { label: 'Amount', value: `${i.amountUsdc} USDC` },
      { label: 'From', value: 'Your wallet' },
      { label: 'Wallet after', value: `${i.walletAfterUsdc} USDC` },
      { label: 'Unstake takes', value: i.cooldownLabel },
    ],
    payload: { address: i.caller, amountUsdc: i.amountUsdc },
    confirmLabel: 'Stake',
    cancelLabel: 'Not now',
  };
}

/// Claim accrued staking yield into the user's wallet. Purely additive.
export function buildClaimYieldConfirm(i: {
  caller: string;
  claimableUsdc: string;
}): ClaimYieldConfirm | { error: string } {
  if (!(Number(i.claimableUsdc) > 0)) {
    return { error: 'They have no yield to claim right now.' };
  }
  return {
    kind: 'confirm',
    id: `claim_yield:${i.claimableUsdc}:${confirmNonce()}`,
    intent: 'claim_yield',
    title: 'Claim your yield',
    summary: `Move ${i.claimableUsdc} USDC of earned yield into your wallet.`,
    fields: [
      { label: 'Amount', value: `${i.claimableUsdc} USDC` },
      { label: 'To', value: 'Your wallet' },
    ],
    payload: { address: i.caller },
    confirmLabel: 'Claim',
    cancelLabel: 'Later',
  };
}

/// Move USDC from the user's balance into an agent wallet. `route` says which
/// pocket it actually leaves, but the card never mentions it: "From: Your
/// wallet" is true either way, because the unified balance IS their wallet's
/// money as far as the product is concerned.
export function buildFundAgentConfirm(i: {
  caller: string;
  agent: 'buyer' | 'seller';
  amountUsdc: number;
  route: MoneyRoute;
  balanceAfterUsdc: string;
}): FundAgentConfirm | { error: string } {
  if (!(i.amountUsdc > 0)) return { error: 'The amount must be greater than 0.' };
  return {
    kind: 'confirm',
    id: `fund_agent:${i.agent}:${i.amountUsdc}:${confirmNonce()}`,
    intent: 'fund_agent',
    title: `Fund your ${i.agent} agent`,
    summary: `Move ${i.amountUsdc} USDC from your wallet to your ${i.agent} agent so it can trade.`,
    fields: [
      { label: 'Amount', value: `${i.amountUsdc} USDC` },
      { label: 'From', value: 'Your wallet' },
      { label: 'To', value: `Your ${i.agent} agent` },
      { label: 'Balance after', value: `${i.balanceAfterUsdc} USDC` },
    ],
    payload: { address: i.caller, agent: i.agent, amountUsdc: i.amountUsdc, route: i.route },
    confirmLabel: 'Fund agent',
    cancelLabel: 'Not now',
  };
}

