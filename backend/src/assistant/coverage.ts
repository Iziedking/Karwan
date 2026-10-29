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
const WALLET_STEP = { by: 'internal', why: 'A bookkeeping step inside a wallet-signed transfer the card or page already runs.' } as const;
const UNUSED = { by: 'internal', why: 'No screen calls it.' } as const;
const ASSISTANT_OWN = { by: 'internal', why: "The assistant's own conversation and memory plumbing." } as const;

export const COVERAGE: Record<string, Coverage> = {
  // Market: requests, offers, matches.
  'POST /api/listings': { by: 'assistant', via: 'post_offer' },
  'POST /api/listings/:/cancel': { by: 'assistant', via: 'cancel_listing' },
  'POST /api/listings/:/edit': { by: 'assistant', via: 'edit_listing' },
  'POST /api/jobs/:/approve-match': { by: 'assistant', via: 'approve_match' },
  'POST /api/jobs/:/decline-match': { by: 'assistant', via: 'decline_match' },
  'POST /api/jobs/:/choose-offer': { by: 'assistant', via: 'choose_offer' },
  'POST /api/jobs/:/raise-offer': { by: 'assistant', via: 'raise_offer' },
  'POST /api/jobs/:/cancel': { by: 'assistant', via: 'cancel_request' },
  'POST /api/jobs/:/edit': { by: 'assistant', via: 'edit_request' },
  'POST /api/jobs/:/offers': { by: 'assistant', via: 'make_offer' },
  'POST /api/jobs/:/offers/:/withdraw': { by: 'assistant', via: 'withdraw_offer' },
  'POST /api/jobs/:/offers/:/lower': { by: 'assistant', via: 'lower_offer' },
  'POST /api/jobs/:/offers/:/accept': { by: 'assistant', via: 'accept_offer' },
  'POST /api/jobs/:/near-miss': { by: 'assistant', via: 'near_miss_proceed' },
  'POST /api/jobs/:/reconsider': { by: 'assistant', via: 'reconsider_offer' },
  'POST /api/agents/seller/bids/abandon': { by: 'assistant', via: 'stop_agent_bid' },
  'POST /api/jobs/:/world-check/request': WORLD,
  'POST /api/jobs/:/world-check/verify': WORLD,
  'POST /api/jobs/:/world-check/skip': { by: 'page', why: 'Part of the World ID check on the request page; skipping it is a testnet step beside the camera check.' },
  'POST /api/research/scout': UNUSED,
  'POST /api/research/activate': { by: 'assistant', via: 'add_research_credit' },
  'POST /api/agents/extract-deal': ASSISTANT_OWN,

  // Deals.
  'POST /api/deals/direct/:/accept': { by: 'assistant', via: 'accept_deal' },
  'POST /api/deals/direct/:/decline': { by: 'assistant', via: 'decline_deal' },
  'POST /api/deals/direct/:/fund': { by: 'assistant', via: 'fund_direct_deal' },
  'POST /api/deals/direct/:/delivered': { by: 'assistant', via: 'mark_delivered' },
  'POST /api/deals/direct/:/release': { by: 'assistant', via: 'release_milestone' },
  'POST /api/deals/direct/:/extension/request': { by: 'assistant', via: 'request_extension' },
  'POST /api/deals/direct/:/extension/respond': { by: 'assistant', via: 'respond_extension' },
  'POST /api/deals/direct/:/appeal': { by: 'assistant', via: 'raise_problem' },
  'POST /api/deals/direct/:/dispute/statement': { by: 'assistant', via: 'dispute_statement' },
  'POST /api/deals/direct/:/dispute/escalate': { by: 'assistant', via: 'escalate_dispute' },
  'POST /api/deals/direct/:/cancel/propose': { by: 'assistant', via: 'cancel_deal' },
  'POST /api/deals/direct/:/cancel/accept': { by: 'assistant', via: 'cancel_deal' },
  'POST /api/deals/direct/:/cancel/decline': { by: 'assistant', via: 'cancel_deal' },
  'POST /api/deals/:/rating': { by: 'assistant', via: 'rate_deal' },
  'POST /api/deals/direct/:/arrived': { by: 'assistant', via: 'goods_arrived' },
  'POST /api/deals/direct/:/handover-code': { by: 'assistant', via: 'show_handover_code' },
  'POST /api/deals/direct/:/evidence/manual-review': { by: 'assistant', via: 'review_delivery_myself' },
  'POST /api/deals/direct/:/claim': { by: 'assistant', via: 'claim_payment' },
  'POST /api/deals/direct/:/delay-appeal': { by: 'assistant', via: 'delay_appeal' },
  'POST /api/deals/direct/:/delay-appeal-respond': { by: 'assistant', via: 'answer_delay_appeal' },
  'POST /api/deals/direct/:/still-reviewing': { by: 'assistant', via: 'still_reviewing' },
  'POST /api/deals/direct/:/cancel': { by: 'assistant', via: 'take_back_deal' },
  'POST /api/deals/direct/:/edit': { by: 'assistant', via: 'change_deal_terms' },
  'POST /api/deals/direct/:/counter': { by: 'assistant', via: 'change_deal_terms' },
  'POST /api/deals/direct/protection': { by: 'internal', why: 'A read: the deal form previews the protection; the assistant deal card already states the terms.' },
  'POST /api/deals/direct/:/counterparty-report/complimentary': { by: 'page', why: 'The report is a document read on the deal page, for verified agents only.' },
  'POST /api/deals/invite/:/claim': { by: 'page', why: 'Joining a deal from an emailed invite happens on the page the link opens.' },
  'POST /api/deals/direct/:/high-signal/request': WORLD,
  'POST /api/deals/direct/:/high-signal/verify': WORLD,
  'POST /api/deals/direct/:/high-signal/skip': WORLD,
  'POST /api/deals/direct/:/payouts/:/reconcile': { by: 'assistant', via: 'recheck_payout' },
  'POST /api/milestones/release': UNUSED,
  'POST /api/chat/:': { by: 'assistant', via: 'message_in_deal' },
  'POST /api/trade/pod/accept': { by: 'page', why: 'Signed in the buyer\'s own wallet on the deal page; Karwan-held wallets use the card.' },
  'POST /api/trade/pod/accept-circle': { by: 'assistant', via: 'confirm_goods_received' },

  // Deal guarantee on the family vault, and older contracts (view 37).
  'POST /api/guarantee/put-up': { by: 'assistant', via: 'guarantee_put_up' },
  'POST /api/guarantee/take-out': { by: 'assistant', via: 'guarantee_take_out' },
  'POST /api/guarantee/cancel-take-out': { by: 'assistant', via: 'guarantee_cancel_take_out' },
  'POST /api/guarantee/collect': { by: 'assistant', via: 'guarantee_collect' },
  'POST /api/guarantee/intent': { by: 'assistant', via: 'guarantee_put_up' },
  'POST /api/guarantee/complete': { by: 'assistant', via: 'guarantee_put_up' },
  'POST /api/yield/claim': { by: 'assistant', via: 'claim_yield' },
  'POST /api/legacy/step': { by: 'assistant', via: 'legacy_step' },

  // Getting paid early runs on the escrow family (view 18): purchase-order
  // financing and invoice factoring are one line, from acceptance on.
  'POST /api/factoring/request': { by: 'assistant', via: 'finance_ask' },
  'POST /api/factoring/withdraw-request': { by: 'assistant', via: 'finance_stop_asking' },
  'POST /api/factoring/accept': { by: 'assistant', via: 'finance_accept' },
  'POST /api/factoring/reject': { by: 'assistant', via: 'finance_reject' },
  'POST /api/factoring/offer': { by: 'assistant', via: 'finance_offer' },
  'POST /api/factoring/offers/:/open': { by: 'assistant', via: 'finance_pay_seller' },
  'POST /api/factoring/offers/:/open/complete': { by: 'assistant', via: 'finance_pay_seller' },
  'POST /api/po-financing/request': { by: 'page', why: 'Refuses new lines: purchase-order financing runs as Get paid now on new deals (view 18).' },
  'POST /api/po-financing/fund': { by: 'page', why: 'Records a line already funded on the retired purchase-order contract.' },
  'POST /api/po-financing/fund-circle': { by: 'page', why: 'Refuses new lines: purchase-order financing runs as Get paid now on new deals (view 18).' },
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
  'POST /api/deposit/requests/:/paid': { by: 'assistant', via: 'pay_payment_link' },
  'POST /api/deposit/requests/:/receive': { by: 'page', why: 'The payment link page shows its own addresses to a payer sending from an exchange; the payer may have no account.' },
  'POST /api/cashout/arc-send': { by: 'assistant', via: 'pay_payment_link' },
  'POST /api/cashout/arc-withdraw': UNUSED,
  'POST /api/activation/faucet': { by: 'assistant', via: 'test_usdc' },
  'POST /api/activation/fund-source': { by: 'assistant', via: 'test_usdc_on_chain' },
  'POST /api/activation/drip-bridge': UNUSED,
  'POST /api/gateway/deposit': { by: 'page', why: 'Pooling for spending on other networks stays on the bridge page; the assistant speaks of one balance (one-wallet rule).' },
  'POST /api/bridge/:/recheck': { by: 'assistant', via: 'recheck_money_move' },
  'POST /api/bridge/circle-bridge/:/resume': { by: 'assistant', via: 'recheck_money_move' },
  'POST /api/money/intents': UNUSED,
  'POST /api/money/intents/:/retry': { by: 'assistant', via: 'retry_money_move' },
  'POST /api/money/intents/:/cancel': { by: 'assistant', via: 'cancel_money_move' },
  'POST /api/money-out/pause': { by: 'assistant', via: 'pause_money_out' },
  'DELETE /api/money-out/addresses/:': { by: 'assistant', via: 'remove_payout_address' },
  'POST /api/money-out/session/request': WORLD,
  'POST /api/money-out/session/verify': WORLD,

  // Record, passport and verification.
  'POST /api/record/setup': { by: 'assistant', via: 'set_up_record' },
  'POST /api/record/nudge-seen': { by: 'internal', why: 'Notes that the receipt line was shown, so it waits a month. Nothing a person does.' },
  'POST /api/reputation/shares': { by: 'assistant', via: 'share_my_passport' },
  'DELETE /api/reputation/shares/:': { by: 'assistant', via: 'stop_passport_share' },
  'POST /api/messages/:': { by: 'assistant', via: 'message_person' },
  'POST /api/me/attestations/revoke': { by: 'assistant', via: 'remove_published_deals' },
  'PUT /api/me/reputation-sources': { by: 'assistant', via: 'set_outside_reads' },
  'POST /api/world-id/rp-signature': WORLD,
  'POST /api/verification/person': WORLD,

  // Setup and agents.
  'POST /api/setup/save': { by: 'assistant', via: 'save_setup' },
  'POST /api/setup/ways': { by: 'assistant', via: 'save_ways' },
  'POST /api/setup/preview': { by: 'internal', why: 'Shows the setup form what its answers would do before saving.' },
  'POST /api/activation/activate': { by: 'assistant', via: 'set_up_agents' },
  'POST /api/activation/agent-names': { by: 'assistant', via: 'rename_agents' },
  'POST /api/activation/agent-binding/register': { by: 'page', why: 'Binding an agent to a wallet is signed by the wallet at activation.' },

  // Account.
  'POST /api/profile': { by: 'assistant', via: 'edit_profile' },
  'POST /api/profile/avatar': { by: 'page', why: 'The photo is cropped and made small on the device before it is saved; the server has no image tools to do it from a chat picture.' },
  'POST /api/profile/x-handle': { by: 'assistant', via: 'set_x_handle' },
  'POST /api/profile/email/request': { by: 'page', why: 'Adding an email needs the code sent to it, entered on the profile page; codes never go through a chat.' },
  'POST /api/profile/email/verify': CONFIRM,
  'POST /api/profile/email/remove': { by: 'assistant', via: 'remove_email' },
  'POST /api/newsletter/subscribe': { by: 'assistant', via: 'join_newsletter' },
  'POST /api/settings': { by: 'assistant', via: 'change_settings' },
  'POST /api/telegram/link/start': { by: 'page', why: 'Linking Telegram opens the bot from the account page with a one-time link.' },
  'POST /api/telegram/link/remove': { by: 'assistant', via: 'unlink_telegram' },
  'POST /api/sme/profile': { by: 'assistant', via: 'edit_company_card' },
  'POST /api/workspaces/business': { by: 'assistant', via: 'create_business' },
  'PATCH /api/workspaces/:': { by: 'assistant', via: 'rename_business' },
  'POST /api/workspaces/:/availability': { by: 'assistant', via: 'save_trade_line' },
  'DELETE /api/workspaces/:/availability/:': { by: 'assistant', via: 'remove_trade_line' },
  'POST /api/business/register': { by: 'page', why: 'Registering a business anchors a document, uploaded and signed on the business page.' },
  'POST /api/business/register-circle': { by: 'page', why: 'Registering a business anchors a document, uploaded and signed on the business page.' },
  'POST /api/business/profile': { by: 'page', why: 'Legal business details change on the business page, where name changes are limited and reviewed.' },
  'POST /api/feedback': { by: 'assistant', via: 'send_feedback' },
  'POST /api/assistant/memory/enabled': { by: 'assistant', via: 'set_memory' },
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
export const PLANNED_CEILING = 3;
