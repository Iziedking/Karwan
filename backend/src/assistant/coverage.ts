/// Every action a person can take in the app (each request in
/// `frontend/core/api.ts` that changes something), and where the assistant
/// stands on it (view 31). `coverage.test.ts` fails on an action missing here,
/// on an assistant entry the runners and tools do not back, and on a planned
/// list that grows. When a phase lands, its entries move to `assistant` and
/// PLANNED_CEILING comes down with them.

export type Coverage =
  /// Run by the assistant: a confirm intent, or a tool that acts directly.
  | { by: 'assistant'; via: string }
  /// Stays on the page by design (view 31, "Page only"); the assistant links to it.
  | { by: 'page'; why: string }
  /// Not a person's action: a step inside another flow, or the assistant's own plumbing.
  | { by: 'internal'; why: string }
  /// An assistant action still to build, by phase of view 31.
  | { by: 'planned'; phase: 'B' | 'C' | 'D' | 'E' };

const SIGN_IN = { by: 'page', why: 'Signing in and creating an account: the secret and the device are the point.' } as const;
const RECOVERY = { by: 'page', why: 'Account recovery: the password and the wait happen on the device.' } as const;
const CONFIRM = { by: 'page', why: 'Setting or using a passkey, Karwan PIN or email code: never carried in a chat.' } as const;
const WORLD = { by: 'page', why: 'World ID and Selfie Check need the camera and the World app.' } as const;
const WAITLIST = { by: 'page', why: 'Joining the waitlist happens before there is an account.' } as const;
const LEGACY = { by: 'page', why: 'Deals and deal insurance on the earlier contracts stay on their page until the last one finishes.' } as const;
const WALLET_STEP = { by: 'internal', why: 'A bookkeeping step inside a wallet-signed transfer the card or page already runs.' } as const;
const UNUSED = { by: 'internal', why: 'No screen calls it.' } as const;
const ASSISTANT_OWN = { by: 'internal', why: "The assistant's own conversation and memory plumbing." } as const;

export const COVERAGE: Record<string, Coverage> = {
  // Market: requests, offers, matches.
  'POST /api/listings': { by: 'assistant', via: 'post_offer' },
  'POST /api/listings/:/cancel': { by: 'assistant', via: 'cancel_listing' },
  'POST /api/listings/:/edit': { by: 'planned', phase: 'C' },
  'POST /api/jobs/:/approve-match': { by: 'assistant', via: 'approve_match' },
  'POST /api/jobs/:/decline-match': { by: 'assistant', via: 'decline_match' },
  'POST /api/jobs/:/choose-offer': { by: 'assistant', via: 'choose_offer' },
  'POST /api/jobs/:/raise-offer': { by: 'assistant', via: 'raise_offer' },
  'POST /api/jobs/:/cancel': { by: 'assistant', via: 'cancel_request' },
  'POST /api/jobs/:/edit': { by: 'assistant', via: 'edit_request' },
  'POST /api/jobs/:/offers': { by: 'planned', phase: 'C' },
  'POST /api/jobs/:/offers/:/withdraw': { by: 'planned', phase: 'C' },
  'POST /api/jobs/:/offers/:/accept': { by: 'planned', phase: 'C' },
  'POST /api/jobs/:/near-miss': { by: 'planned', phase: 'C' },
  'POST /api/jobs/:/reconsider': { by: 'planned', phase: 'C' },
  'POST /api/agents/seller/bids/abandon': { by: 'planned', phase: 'C' },
  'POST /api/jobs/:/world-check/request': WORLD,
  'POST /api/jobs/:/world-check/verify': WORLD,
  'POST /api/jobs/:/world-check/skip': { by: 'planned', phase: 'C' },
  'POST /api/research/scout': { by: 'planned', phase: 'C' },
  'POST /api/research/activate': { by: 'planned', phase: 'E' },
  'POST /api/agents/extract-deal': ASSISTANT_OWN,

  // Deals.
  'POST /api/deals/direct/:/accept': { by: 'assistant', via: 'accept_deal' },
  'POST /api/deals/direct/:/decline': { by: 'assistant', via: 'decline_deal' },
  'POST /api/deals/direct/:/fund': { by: 'assistant', via: 'fund_direct_deal' },
  'POST /api/deals/direct/:/delivered': { by: 'assistant', via: 'mark_delivered' },
  'POST /api/deals/direct/:/release': { by: 'assistant', via: 'release_milestone' },
  'POST /api/deals/direct/:/extension/request': { by: 'assistant', via: 'request_extension' },
  'POST /api/deals/direct/:/extension/respond': { by: 'assistant', via: 'respond_extension' },
  'POST /api/deals/direct/:/appeal': { by: 'assistant', via: 'ask_for_payment' },
  'POST /api/deals/direct/:/dispute/statement': { by: 'assistant', via: 'dispute_statement' },
  'POST /api/deals/direct/:/dispute/escalate': { by: 'assistant', via: 'escalate_dispute' },
  'POST /api/deals/direct/:/cancel/propose': { by: 'assistant', via: 'cancel_deal' },
  'POST /api/deals/direct/:/cancel/accept': { by: 'assistant', via: 'cancel_deal' },
  'POST /api/deals/direct/:/cancel/decline': { by: 'assistant', via: 'cancel_deal' },
  'POST /api/deals/:/rating': { by: 'assistant', via: 'rate_deal' },
  'POST /api/deals/direct/:/arrived': { by: 'planned', phase: 'C' },
  'POST /api/deals/direct/:/evidence/manual-review': { by: 'planned', phase: 'C' },
  'POST /api/deals/direct/:/claim': { by: 'planned', phase: 'C' },
  'POST /api/deals/direct/:/delay-appeal': { by: 'planned', phase: 'C' },
  'POST /api/deals/direct/:/delay-appeal-respond': { by: 'planned', phase: 'C' },
  'POST /api/deals/direct/:/still-reviewing': { by: 'planned', phase: 'C' },
  'POST /api/deals/direct/:/cancel': { by: 'planned', phase: 'C' },
  'POST /api/deals/direct/:/edit': { by: 'planned', phase: 'C' },
  'POST /api/deals/direct/:/counter': { by: 'planned', phase: 'C' },
  'POST /api/deals/direct/protection': { by: 'planned', phase: 'C' },
  'POST /api/deals/direct/:/counterparty-report/complimentary': { by: 'planned', phase: 'C' },
  'POST /api/deals/invite/:/claim': { by: 'planned', phase: 'C' },
  'POST /api/deals/direct/:/high-signal/request': WORLD,
  'POST /api/deals/direct/:/high-signal/verify': WORLD,
  'POST /api/deals/direct/:/high-signal/skip': { by: 'planned', phase: 'C' },
  'POST /api/deals/direct/:/payouts/:/reconcile': { by: 'planned', phase: 'D' },
  'POST /api/milestones/release': { by: 'planned', phase: 'C' },
  'POST /api/chat/:': { by: 'planned', phase: 'C' },
  'POST /api/trade/pod/accept': { by: 'planned', phase: 'C' },
  'POST /api/trade/pod/accept-circle': { by: 'planned', phase: 'C' },
  'POST /api/legacy/deals/:/refund': LEGACY,
  'POST /api/legacy/deals/:/release-final': LEGACY,
  'POST /api/legacy/deals/:/cancel-propose': LEGACY,
  'POST /api/legacy/deals/:/cancel-accept': LEGACY,

  // Deal insurance (phase A).
  'POST /api/vault/deposit': { by: 'assistant', via: 'stake_usdc' },
  'POST /api/yield/claim': { by: 'assistant', via: 'claim_yield' },
  'POST /api/vault/request-withdraw': { by: 'assistant', via: 'insurance_take_out' },
  'POST /api/vault/cancel-withdraw': { by: 'assistant', via: 'insurance_cancel_take_out' },
  'POST /api/vault/claim': { by: 'assistant', via: 'insurance_collect' },
  'POST /api/vault/action/intent': { by: 'assistant', via: 'insurance_take_out' },
  'POST /api/vault/action/complete': { by: 'assistant', via: 'insurance_take_out' },
  'POST /api/vault/deposit/intent': { by: 'planned', phase: 'D' },
  'POST /api/vault/deposit/complete': { by: 'planned', phase: 'D' },
  'POST /api/vault/record-stake': UNUSED,
  'POST /api/legacy/vault/request-withdraw': LEGACY,
  'POST /api/legacy/vault/cancel-withdraw': LEGACY,
  'POST /api/legacy/vault/claim': LEGACY,

  // Getting paid early (phase B). Purchase-order financing is off on testnet
  // until a contract the escrow authorises is live (T4.2); its three stay planned.
  'POST /api/factoring/request': { by: 'assistant', via: 'finance_ask' },
  'POST /api/factoring/withdraw-request': { by: 'assistant', via: 'finance_stop_asking' },
  'POST /api/factoring/accept': { by: 'assistant', via: 'finance_accept' },
  'POST /api/factoring/reject': { by: 'assistant', via: 'finance_reject' },
  'POST /api/factoring/offer': { by: 'assistant', via: 'finance_offer' },
  'POST /api/po-financing/request': { by: 'planned', phase: 'B' },
  'POST /api/po-financing/fund': { by: 'planned', phase: 'B' },
  'POST /api/po-financing/fund-circle': { by: 'planned', phase: 'B' },
  'POST /api/po-financing/archive': { by: 'page', why: 'Dismissing a line from the retired purchase-order rail, kept on the financier desk until the last one is gone.' },
  'POST /api/po-financing/claim': UNUSED,
  'POST /api/po-financing/default': UNUSED,
  'POST /api/financier/apply': { by: 'assistant', via: 'finance_apply' },
  'POST /api/financing-chat/:/:': { by: 'assistant', via: 'message_about_early_payment' },

  // Money.
  'POST /api/activation/withdraw': { by: 'assistant', via: 'withdraw_proceeds' },
  'POST /api/activation/fund-agent': { by: 'assistant', via: 'fund_agent' },
  'POST /api/gateway/fund-agent': { by: 'assistant', via: 'fund_agent' },
  'POST /api/gateway/cash-out': { by: 'assistant', via: 'cash_out' },
  'POST /api/bridge/circle-bridge': { by: 'assistant', via: 'top_up_to_arc' },
  'POST /api/bridge/circle-bridge-out': { by: 'assistant', via: 'cash_out' },
  'POST /api/deposit/requests': { by: 'assistant', via: 'create_payment_link' },
  'POST /api/deposit/requests/:/cancel': { by: 'assistant', via: 'cancel_payment_link' },
  'POST /api/activation/fund-agent-web3/intent': WALLET_STEP,
  'POST /api/activation/fund-agent-web3/complete': WALLET_STEP,
  'POST /api/bridge/relay': WALLET_STEP,
  'POST /api/bridge/circle-bridge-app-kit': WALLET_STEP,
  'POST /api/bridge/web3-bridge-out/quote': WALLET_STEP,
  'POST /api/bridge/web3-bridge-out': WALLET_STEP,
  'POST /api/bridge/record': UNUSED,
  'POST /api/gateway/refresh': { by: 'internal', why: 'Refreshes a cached balance read after a deposit.' },
  'POST /api/deposit/requests/:/paid': { by: 'planned', phase: 'D' },
  'POST /api/deposit/requests/:/receive': { by: 'planned', phase: 'D' },
  'POST /api/cashout/arc-send': { by: 'planned', phase: 'D' },
  'POST /api/cashout/arc-withdraw': UNUSED,
  'POST /api/activation/faucet': { by: 'planned', phase: 'D' },
  'POST /api/activation/fund-source': { by: 'planned', phase: 'D' },
  'POST /api/activation/drip-bridge': UNUSED,
  'POST /api/gateway/deposit': { by: 'planned', phase: 'D' },
  'POST /api/bridge/:/recheck': { by: 'planned', phase: 'D' },
  'POST /api/bridge/circle-bridge/:/resume': { by: 'planned', phase: 'D' },
  'POST /api/money/intents': UNUSED,
  'POST /api/money/intents/:/retry': { by: 'planned', phase: 'D' },
  'POST /api/money/intents/:/cancel': { by: 'planned', phase: 'D' },
  'POST /api/money-out/pause': { by: 'planned', phase: 'D' },
  'DELETE /api/money-out/addresses/:': { by: 'planned', phase: 'D' },
  'POST /api/money-out/session/request': WORLD,
  'POST /api/money-out/session/verify': WORLD,

  // Record, passport and verification.
  'POST /api/record/setup': { by: 'assistant', via: 'set_up_record' },
  'POST /api/reputation/shares': { by: 'assistant', via: 'share_my_passport' },
  'DELETE /api/reputation/shares/:': { by: 'assistant', via: 'stop_passport_share' },
  'POST /api/messages/:': { by: 'assistant', via: 'message_person' },
  'POST /api/me/attestations/revoke': { by: 'planned', phase: 'E' },
  'PUT /api/me/reputation-sources': { by: 'planned', phase: 'E' },
  'POST /api/world-id/rp-signature': WORLD,
  'POST /api/verification/person': WORLD,

  // Setup and agents.
  'POST /api/setup/save': { by: 'assistant', via: 'save_setup' },
  'POST /api/setup/ways': { by: 'assistant', via: 'save_ways' },
  'POST /api/setup/preview': { by: 'internal', why: 'Shows the setup form what its answers would do before saving.' },
  'POST /api/activation/activate': { by: 'planned', phase: 'E' },
  'POST /api/activation/agent-names': { by: 'planned', phase: 'E' },
  'POST /api/activation/agent-binding/register': { by: 'page', why: 'Binding an agent to a wallet is signed by the wallet at activation.' },

  // Account.
  'POST /api/profile': { by: 'planned', phase: 'E' },
  'POST /api/profile/avatar': { by: 'planned', phase: 'E' },
  'POST /api/profile/x-handle': { by: 'planned', phase: 'E' },
  'POST /api/profile/email/request': { by: 'planned', phase: 'E' },
  'POST /api/profile/email/verify': CONFIRM,
  'POST /api/profile/email/remove': { by: 'planned', phase: 'E' },
  'POST /api/newsletter/subscribe': { by: 'planned', phase: 'E' },
  'POST /api/settings': { by: 'planned', phase: 'E' },
  'POST /api/telegram/link/start': { by: 'planned', phase: 'E' },
  'POST /api/telegram/link/remove': { by: 'planned', phase: 'E' },
  'POST /api/sme/profile': { by: 'planned', phase: 'E' },
  'POST /api/workspaces/business': { by: 'planned', phase: 'E' },
  'PATCH /api/workspaces/:': { by: 'planned', phase: 'E' },
  'POST /api/workspaces/:/availability': { by: 'planned', phase: 'E' },
  'DELETE /api/workspaces/:/availability/:': { by: 'planned', phase: 'E' },
  'POST /api/business/register': { by: 'planned', phase: 'E' },
  'POST /api/business/register-circle': { by: 'planned', phase: 'E' },
  'POST /api/business/profile': { by: 'planned', phase: 'E' },
  'POST /api/feedback': { by: 'planned', phase: 'E' },
  'POST /api/assistant/memory/enabled': { by: 'planned', phase: 'E' },
  'DELETE /api/assistant/memory': { by: 'assistant', via: 'forget_memory' },
  'DELETE /api/assistant/memory/notes/:': { by: 'assistant', via: 'forget_memory' },
  'DELETE /api/profile': { by: 'page', why: 'Deleting the account is irreversible; the 7-day wait starts on the page after reading what is lost.' },
  'POST /api/x/oauth/start': { by: 'page', why: 'Linking X signs in at X in the browser.' },
  'POST /api/terms/accept': { by: 'page', why: 'Accepting the terms is read and agreed by the person on the page.' },
  'POST /api/auth/logout': { by: 'page', why: 'Signing out of this browser.' },
  'POST /api/survey/research': { by: 'page', why: 'The public research survey, answered without an account.' },
  'POST /api/feedback/:/status': { by: 'internal', why: "The team's triage of feedback." },
  'POST /api/diagnose': { by: 'internal', why: 'The help panel sends its own diagnostics.' },
  'POST /api/assistant/chat': ASSISTANT_OWN,
  'POST /api/assistant/conversations': ASSISTANT_OWN,
  'DELETE /api/assistant/conversations/:': ASSISTANT_OWN,
  'POST /api/support/start': { by: 'assistant', via: '[[HUMAN]]' },
  'POST /api/support/:/message': { by: 'internal', why: 'Messages inside the support chat a person joined.' },
  'POST /api/support/:/close': { by: 'internal', why: 'Closing the support chat a person joined.' },

  // Sign-in, recovery, confirmation, waitlist.
  'POST /api/signup': SIGN_IN,
  'POST /api/signup/tag': SIGN_IN,
  'POST /api/auth/lookup': SIGN_IN,
  'POST /api/auth/passkey/add/options': SIGN_IN,
  'POST /api/auth/passkey/add/verify': SIGN_IN,
  'POST /api/auth/register/options': SIGN_IN,
  'POST /api/auth/register/verify': SIGN_IN,
  'POST /api/auth/login/options': SIGN_IN,
  'POST /api/auth/login/verify': SIGN_IN,
  'POST /api/auth/otp/request': SIGN_IN,
  'POST /api/auth/otp/verify': SIGN_IN,
  'POST /api/siwe/nonce': SIGN_IN,
  'POST /api/siwe/verify': SIGN_IN,
  'POST /api/recovery/setup': RECOVERY,
  'POST /api/recovery/registered': RECOVERY,
  'POST /api/recovery/code/request': RECOVERY,
  'POST /api/recovery/code/verify': RECOVERY,
  'POST /api/recovery/state': RECOVERY,
  'POST /api/recovery/kdf': RECOVERY,
  'POST /api/recovery/start': RECOVERY,
  'POST /api/recovery/cancel': RECOVERY,
  'POST /api/recovery/release': RECOVERY,
  'POST /api/recovery/completed': RECOVERY,
  'POST /api/confirm': CONFIRM,
  'POST /api/confirm/options': CONFIRM,
  'POST /api/confirm/email-code': CONFIRM,
  'POST /api/confirm/pin': CONFIRM,
  'POST /api/confirm/pin/reset': CONFIRM,
  'POST /api/confirm/passkey/options': CONFIRM,
  'POST /api/confirm/passkey/register': CONFIRM,
  'POST /api/waitlist/request': WAITLIST,
  'POST /api/waitlist/verify': WAITLIST,
  'POST /api/waitlist/use-case': WAITLIST,
};

/// How many actions are still to build. It only comes down: lower it as each
/// phase lands, and the test fails if the planned list grows past it.
export const PLANNED_CEILING = 69;
