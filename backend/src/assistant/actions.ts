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
}

/// Both Gateway routes derive the caller from the session, so no address in the
/// payload. gateway_deposit adds USDC from the identity wallet to the user's
/// unified balance; gateway_fund_agent moves it from the balance to an agent.
export interface GatewayDepositPayload {
  amountUsdc: number;
}
export interface GatewayFundAgentPayload {
  agent: 'buyer' | 'seller';
  amountUsdc: number;
}
export interface GatewayCashOutPayload {
  destChainKey: string;
  recipient: string;
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
export interface GatewayDepositConfirm extends ConfirmActionBase {
  intent: 'gateway_deposit';
  payload: GatewayDepositPayload;
}
export interface GatewayFundAgentConfirm extends ConfirmActionBase {
  intent: 'gateway_fund_agent';
  payload: GatewayFundAgentPayload;
}
export interface GatewayCashOutConfirm extends ConfirmActionBase {
  intent: 'gateway_cash_out';
  payload: GatewayCashOutPayload;
}

/// Discriminated on `intent`, which also tells the frontend which route to call.
export type ConfirmAction =
  | PostOfferConfirm
  | PostRequestConfirm
  | ReleaseConfirm
  | WithdrawConfirm
  | CashOutConfirm
  | GatewayDepositConfirm
  | GatewayFundAgentConfirm
  | GatewayCashOutConfirm;

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
  if (brief.length < 5 || brief.length > 1000) {
    return { error: 'The request needs a short description between 5 and 1000 characters.' };
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
    id: `post_request:${brief.toLowerCase().slice(0, 40)}:${i.budgetUsdc}`,
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
    { label: 'Left on Arc', value: `${i.balanceAfterUsdc} USDC` },
  ];
  return {
    kind: 'confirm',
    id: `cash_out:${i.destChainKey}:${dest}:${i.amountUsdc}`,
    intent: 'cash_out',
    title: 'Cash out to another chain',
    summary: `Send ${i.amountUsdc} USDC from your Arc wallet to ${i.destChainLabel}.`,
    warning: 'This bridges USDC off Arc and cannot be undone. Check the address and chain.',
    fields,
    payload: {
      address: i.caller,
      destChainKey: i.destChainKey,
      amountUsdc: i.amountUsdc,
      recipient: dest,
      sourceKind: 'identity',
    },
    confirmLabel: 'Cash out',
    cancelLabel: 'Not now',
  };
}

/// Build a gateway-deposit confirm card (add USDC from the identity wallet to the
/// user's unified balance). No stark warning: the balance is theirs and stays
/// spendable (fund an agent, or cash out). Never throws.
export function buildGatewayDepositConfirm(i: {
  amountUsdc: number;
  balanceAfterUsdc: string;
}): GatewayDepositConfirm | { error: string } {
  if (!(i.amountUsdc > 0)) return { error: 'The amount must be greater than 0.' };
  return {
    kind: 'confirm',
    id: `gateway_deposit:${i.amountUsdc}`,
    intent: 'gateway_deposit',
    title: 'Add to your balance',
    summary: `Move ${i.amountUsdc} USDC from your wallet into your unified balance, ready to fund your agents.`,
    fields: [
      { label: 'Amount', value: `${i.amountUsdc} USDC` },
      { label: 'From', value: 'Your wallet' },
      { label: 'To', value: 'Your unified balance' },
      { label: 'Wallet after', value: `${i.balanceAfterUsdc} USDC` },
    ],
    payload: { amountUsdc: i.amountUsdc },
    confirmLabel: 'Add to balance',
    cancelLabel: 'Not now',
  };
}

/// Build a gateway-fund-agent confirm card (move USDC from the unified balance to
/// one of the user's agent wallets). Never throws.
export function buildGatewayFundAgentConfirm(i: {
  agent: 'buyer' | 'seller';
  amountUsdc: number;
  balanceAfterUsdc: string;
}): GatewayFundAgentConfirm | { error: string } {
  if (!(i.amountUsdc > 0)) return { error: 'The amount must be greater than 0.' };
  return {
    kind: 'confirm',
    id: `gateway_fund_agent:${i.agent}:${i.amountUsdc}`,
    intent: 'gateway_fund_agent',
    title: `Fund your ${i.agent} agent`,
    summary: `Move ${i.amountUsdc} USDC from your unified balance to your ${i.agent} agent wallet so it can trade.`,
    fields: [
      { label: 'Amount', value: `${i.amountUsdc} USDC` },
      { label: 'From', value: 'Your unified balance' },
      { label: 'To', value: `Your ${i.agent} agent wallet` },
      { label: 'Balance after', value: `${i.balanceAfterUsdc} USDC` },
    ],
    payload: { agent: i.agent, amountUsdc: i.amountUsdc },
    confirmLabel: 'Fund agent',
    cancelLabel: 'Not now',
  };
}

/// Build a gateway-cash-out confirm card (spend from the unified balance to
/// another chain). Cross-chain, so a small Gateway fee applies. Shows the full
/// destination address. Never throws.
export function buildGatewayCashOutConfirm(i: {
  destChainKey: string;
  destChainLabel: string;
  recipient: string;
  amountUsdc: number;
  balanceAfterUsdc: string;
}): GatewayCashOutConfirm | { error: string } {
  const to = i.recipient?.trim() ?? '';
  if (!/^0x[0-9a-fA-F]{40}$/.test(to)) {
    return { error: 'That destination address is not a valid 0x address.' };
  }
  if (!(i.amountUsdc > 0)) return { error: 'The amount must be greater than 0.' };
  const dest = to.toLowerCase();
  return {
    kind: 'confirm',
    id: `gateway_cash_out:${i.destChainKey}:${dest}:${i.amountUsdc}`,
    intent: 'gateway_cash_out',
    title: 'Cash out from your balance',
    summary: `Send ${i.amountUsdc} USDC from your unified balance to ${i.destChainLabel}.`,
    warning: 'This bridges USDC to another chain and cannot be undone. Check the address and chain.',
    fields: [
      { label: 'Amount', value: `${i.amountUsdc} USDC` },
      { label: 'To chain', value: i.destChainLabel },
      { label: 'To address', value: dest },
      { label: 'Balance after', value: `${i.balanceAfterUsdc} USDC` },
    ],
    payload: { destChainKey: i.destChainKey, recipient: dest, amountUsdc: i.amountUsdc },
    confirmLabel: 'Cash out',
    cancelLabel: 'Not now',
  };
}
