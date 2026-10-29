import { randomUUID } from 'node:crypto';
import type { ConfirmAction } from '../assistant/actions.js';
import type { ExecuteResult } from './dispatch.js';

type Call = (
  address: string,
  method: 'GET' | 'POST' | 'DELETE' | 'PUT' | 'PATCH',
  path: string,
  body?: unknown,
) => Promise<{ status: number; json: Record<string, unknown> }>;

type P = Record<string, unknown>;
type Step = { method: 'GET' | 'POST' | 'DELETE' | 'PUT' | 'PATCH'; path: string; body?: unknown };

/// What each confirm card does, as the web app's own calls (AssistantWidget's
/// executor and core/api.ts). Chat runs these exact routes, so validation,
/// authorization and idempotency are the app's, not a second copy.
export const ROUTES: Partial<Record<ConfirmAction['intent'], (p: P, a: ConfirmAction) => Step>> = {
  post_offer: (p) => ({ method: 'POST', path: '/api/listings', body: p }),
  save_setup: (p) => ({ method: 'POST', path: '/api/setup/save', body: { answers: p.answers } }),
  save_ways: (p) => ({ method: 'POST', path: '/api/setup/ways', body: { ways: p.ways } }),
  // The card carries the exact body the deal form sends, already validated (view 24).
  create_direct_deal: (p) => ({ method: 'POST', path: '/api/deals/direct', body: p }),
  post_request: (p) => ({
    method: 'POST',
    path: '/api/jobs',
    body: {
      posterAddress: p.posterAddress,
      brief: p.brief,
      budgetUsdc: p.budgetUsdc,
      deadlineSeconds: Math.min(90 * 86_400, Math.max(60, Math.round(Number(p.deadlineDays) * 86_400))),
      ...(p.deliveryKind ? { deliveryKind: p.deliveryKind } : {}),
      ...(p.where ? { where: p.where } : {}),
      ...(p.agreeForMe === true ? { agreeForMe: true } : {}),
      ...(p.quantity ? { quantity: p.quantity } : {}),
    },
  }),
  release_milestone: (p) => ({ method: 'POST', path: `/api/deals/direct/${p.jobId}/release`, body: { caller: p.caller } }),
  withdraw_proceeds: (p) => ({ method: 'POST', path: '/api/activation/withdraw', body: { ...p, requestId: randomUUID() } }),
  cash_out: (p, a) =>
    p.route === 'unified'
      ? {
          method: 'POST',
          path: '/api/gateway/cash-out',
          body: { destChainKey: p.destChainKey, recipient: p.recipient, amountUsdc: p.amountUsdc, requestId: randomUUID() },
        }
      : {
          method: 'POST',
          path: '/api/bridge/circle-bridge-out',
          body: {
            bridgeId: stableBridgeId(a.id),
            address: p.address,
            destChainKey: p.destChainKey,
            amountUsdc: p.amountUsdc,
            recipient: p.recipient,
            sourceKind: p.sourceKind,
          },
        },
  approve_match: (p) => ({ method: 'POST', path: `/api/jobs/${p.jobId}/approve-match`, body: { caller: p.caller } }),
  decline_match: (p) => ({
    method: 'POST',
    path: `/api/jobs/${p.jobId}/decline-match`,
    body: { caller: p.caller, ...(p.reason ? { reason: p.reason } : {}) },
  }),
  mark_delivered: (p) => ({
    method: 'POST',
    path: `/api/deals/direct/${p.jobId}/delivered`,
    body: {
      caller: p.caller,
      ...(p.deliveryProof ? { deliveryProof: p.deliveryProof } : {}),
      ...(p.shipment ? { shipment: p.shipment } : {}),
      ...(p.handoverCode ? { handoverCode: p.handoverCode } : {}),
      ...(p.heldPhotos ? { heldPhotos: true } : {}),
    },
  }),
  cancel_request: (p) => ({ method: 'POST', path: `/api/jobs/${p.jobId}/cancel`, body: { caller: p.caller } }),
  cancel_listing: (p) => ({ method: 'POST', path: `/api/listings/${p.listingId}/cancel`, body: { caller: p.caller } }),
  claim_yield: (p) => ({ method: 'POST', path: '/api/yield/claim', body: { address: p.address } }),
  // Deal guarantee on the family vault (view 37).
  guarantee_put_up: (p) => ({ method: 'POST', path: '/api/guarantee/put-up', body: { amountUsdc: p.amountUsdc, requestId: randomUUID() } }),
  guarantee_take_out: (p) => ({ method: 'POST', path: '/api/guarantee/take-out', body: { amountUsdc: p.amountUsdc, requestId: randomUUID() } }),
  guarantee_cancel_take_out: () => ({ method: 'POST', path: '/api/guarantee/cancel-take-out', body: { requestId: randomUUID() } }),
  guarantee_collect: () => ({ method: 'POST', path: '/api/guarantee/collect', body: { requestId: randomUUID() } }),
  legacy_step: (p) => ({ method: 'POST', path: '/api/legacy/step', body: { kind: p.kind, contract: p.contract, ref: p.ref, step: p.step } }),
  // Getting paid early (view 31, phase B), the deal page's and the financier desk's calls.
  finance_ask: (p) => ({
    method: 'POST',
    path: '/api/factoring/request',
    body: { invoiceId: p.invoiceId, requestedAdvanceUsdc: p.requestedAdvanceUsdc, ...(p.minAdvanceUsdc ? { minAdvanceUsdc: p.minAdvanceUsdc } : {}) },
  }),
  finance_stop_asking: (p) => ({ method: 'POST', path: '/api/factoring/withdraw-request', body: { invoiceId: p.invoiceId } }),
  finance_accept: (p) => ({ method: 'POST', path: '/api/factoring/accept', body: { offerId: p.offerId, ...(p.putUpGap ? { putUpGap: true } : {}) } }),
  finance_reject: (p) => ({ method: 'POST', path: '/api/factoring/reject', body: { offerId: p.offerId } }),
  finance_offer: (p) => ({
    method: 'POST',
    path: '/api/factoring/offer',
    body: { invoiceId: p.invoiceId, offeredAdvanceUsdc: p.offeredAdvanceUsdc, expectedReturnUsdc: p.expectedReturnUsdc, expiresInHours: p.expiresInHours },
  }),
  finance_apply: () => ({ method: 'POST', path: '/api/financier/apply', body: {} }),
  // Contests (view 40): the contest page's calls.
  contest_post: (p) => ({ method: 'POST', path: '/api/contests', body: p }),
  contest_enter: (p) => ({ method: 'POST', path: `/api/contests/${encodeURIComponent(String(p.contestId))}/entries`, body: { note: p.note, heldFiles: true } }),
  contest_award: (p) => ({ method: 'POST', path: `/api/contests/${encodeURIComponent(String(p.contestId))}/award`, body: { entryIds: p.entryIds } }),
  contest_cancel: (p) => ({ method: 'POST', path: `/api/contests/${encodeURIComponent(String(p.contestId))}/cancel`, body: {} }),
  // Placeholder so the route table knows the intent; fundDirect runs it.
  fund_direct_deal: (p) => ({ method: 'POST', path: `/api/deals/direct/${p.jobId}/fund` }),
  // A held wallet needs the person to confirm it is them, which happens on Karwan.
  set_up_record: () => ({ method: 'POST', path: '/api/record/setup' }),
  fund_agent: (p) =>
    p.route === 'unified'
      ? { method: 'POST', path: '/api/gateway/fund-agent', body: { agent: p.agent, amountUsdc: p.amountUsdc, requestId: randomUUID() } }
      : {
          method: 'POST',
          path: '/api/activation/fund-agent',
          body: { address: p.address, agent: p.agent, amountUsdc: p.amountUsdc, requestId: randomUUID() },
        },
  top_up_to_arc: (p, a) => ({
    method: 'POST',
    path: '/api/bridge/circle-bridge',
    body: {
      bridgeId: stableBridgeId(a.id),
      address: p.address,
      sourceChainKey: p.sourceChainKey,
      amountUsdc: p.amountUsdc,
      mintRecipient: p.mintRecipient,
      sourceKind: p.sourceKind,
    },
  }),
  choose_offer: (p) => ({
    method: 'POST',
    path: `/api/jobs/${p.jobId}/choose-offer`,
    body: {
      caller: p.caller,
      seller: p.seller,
      ...(p.acknowledgeUnverified ? { acknowledgeUnverified: true } : {}),
      ...(p.amountUsdc !== undefined ? { expectedPriceUsdc: p.amountUsdc } : {}),
    },
  }),
  edit_request: (p) => ({
    method: 'POST',
    path: `/api/jobs/${p.jobId}/edit`,
    body: {
      caller: p.caller,
      ...(p.briefText ? { briefText: p.briefText } : {}),
      ...(p.negotiationMaxIncreasePct !== undefined ? { negotiationMaxIncreasePct: p.negotiationMaxIncreasePct } : {}),
    },
  }),
  raise_offer: (p) => ({ method: 'POST', path: `/api/jobs/${p.jobId}/raise-offer`, body: { caller: p.caller, priceUsdc: p.priceUsdc } }),
  request_extension: (p) => ({
    method: 'POST',
    path: `/api/deals/direct/${p.jobId}/extension/request`,
    body: { caller: p.caller, additionalSeconds: p.additionalSeconds, ...(p.reason ? { reason: p.reason } : {}) },
  }),
  respond_extension: (p) => ({
    method: 'POST',
    path: `/api/deals/direct/${p.jobId}/extension/respond`,
    body: { caller: p.caller, decision: p.decision },
  }),
  cancel_deal: (p) =>
    p.step === 'propose'
      ? { method: 'POST', path: `/api/deals/direct/${p.jobId}/cancel/propose`, body: { caller: p.caller, reason: p.reason ?? '', kind: 'mutual' } }
      : { method: 'POST', path: `/api/deals/direct/${p.jobId}/cancel/${p.step === 'accept' ? 'accept' : 'decline'}`, body: { caller: p.caller } },
  dispute_statement: (p) => ({
    method: 'POST',
    path: `/api/deals/direct/${p.jobId}/dispute/statement`,
    body: { caller: p.caller, received: p.received, missing: p.missing, late: p.late, links: p.links },
  }),
  escalate_dispute: (p) => ({ method: 'POST', path: `/api/deals/direct/${p.jobId}/dispute/escalate`, body: { caller: p.caller } }),
  raise_problem: (p) => ({ method: 'POST', path: `/api/deals/direct/${p.jobId}/appeal`, body: { caller: p.caller, reason: p.reason } }),
  decline_deal: (p) => ({ method: 'POST', path: `/api/deals/direct/${p.jobId}/decline`, body: { caller: p.caller, note: p.note } }),
  goods_arrived: (p) => ({ method: 'POST', path: `/api/deals/direct/${p.jobId}/arrived`, body: { caller: p.caller } }),
  review_delivery_myself: (p) => ({ method: 'POST', path: `/api/deals/direct/${p.jobId}/evidence/manual-review`, body: { caller: p.caller } }),
  claim_payment: (p) => ({ method: 'POST', path: `/api/deals/direct/${p.jobId}/claim`, body: { caller: p.caller } }),
  still_reviewing: (p) => ({ method: 'POST', path: `/api/deals/direct/${p.jobId}/still-reviewing`, body: { caller: p.caller } }),
  delay_appeal: (p) => ({ method: 'POST', path: `/api/deals/direct/${p.jobId}/delay-appeal`, body: { caller: p.caller } }),
  answer_delay_appeal: (p) => ({ method: 'POST', path: `/api/deals/direct/${p.jobId}/delay-appeal-respond`, body: { caller: p.caller, reason: p.reason } }),
  take_back_deal: (p) => ({ method: 'POST', path: `/api/deals/direct/${p.jobId}/cancel`, body: { caller: p.caller } }),
  change_settings: (p) => ({ method: 'POST', path: '/api/settings', body: { settings: p.settings } }),
  edit_profile: (p) => ({ method: 'POST', path: '/api/profile', body: p }),
  set_x_handle: (p) => ({ method: 'POST', path: '/api/profile/x-handle', body: { address: p.address, handle: p.handle } }),
  remove_email: (p) => ({ method: 'POST', path: '/api/profile/email/remove', body: { address: p.address } }),
  join_newsletter: (p) => ({ method: 'POST', path: '/api/newsletter/subscribe', body: { email: p.email } }),
  unlink_telegram: (p) => ({ method: 'POST', path: '/api/telegram/link/remove', body: { address: p.address } }),
  set_memory: (p) => ({ method: 'POST', path: '/api/assistant/memory/enabled', body: { on: p.on } }),
  remove_published_deals: () => ({ method: 'POST', path: '/api/me/attestations/revoke', body: {} }),
  set_outside_reads: (p) => ({ method: 'PUT', path: '/api/me/reputation-sources', body: { address: p.address, outsideReadable: p.outsideReadable } }),
  send_feedback: (p) => ({ method: 'POST', path: '/api/feedback', body: { category: p.category, title: p.title, message: p.message } }),
  set_up_agents: (p) => ({ method: 'POST', path: '/api/activation/activate', body: p }),
  rename_agents: (p) => ({ method: 'POST', path: '/api/activation/agent-names', body: p }),
  add_research_credit: () => ({ method: 'POST', path: '/api/research/activate', body: {} }),
  create_business: (p) => ({ method: 'POST', path: '/api/workspaces/business', body: { name: p.name } }),
  rename_business: (p) => ({ method: 'PATCH', path: `/api/workspaces/${encodeURIComponent(String(p.workspaceId))}`, body: { name: p.name } }),
  save_trade_line: (p) => {
    const { workspaceId, ...body } = p;
    return { method: 'POST', path: `/api/workspaces/${encodeURIComponent(String(workspaceId))}/availability`, body };
  },
  remove_trade_line: (p) => ({
    method: 'DELETE',
    path: `/api/workspaces/${encodeURIComponent(String(p.workspaceId))}/availability/${encodeURIComponent(String(p.availabilityId))}`,
  }),
  edit_company_card: (p) => ({ method: 'POST', path: '/api/sme/profile', body: { address: p.address, smeProfile: p.smeProfile } }),
  test_usdc: (p) => ({ method: 'POST', path: '/api/activation/faucet', body: { address: p.address, target: p.target } }),
  test_usdc_on_chain: (p) => ({ method: 'POST', path: '/api/activation/fund-source', body: { address: p.address, chain: p.chain } }),
  recheck_money_move: (p) => ({
    method: 'POST',
    path: p.step === 'resume' ? `/api/bridge/circle-bridge/${encodeURIComponent(String(p.bridgeId))}/resume` : `/api/bridge/${encodeURIComponent(String(p.bridgeId))}/recheck`,
    body: {},
  }),
  retry_money_move: (p) => ({ method: 'POST', path: `/api/money/intents/${encodeURIComponent(String(p.intentId))}/retry`, body: {} }),
  cancel_money_move: (p) => ({ method: 'POST', path: `/api/money/intents/${encodeURIComponent(String(p.intentId))}/cancel`, body: {} }),
  recheck_payout: (p) => ({
    method: 'POST',
    path: `/api/deals/direct/${p.jobId}/payouts/${encodeURIComponent(String(p.reference))}/reconcile`,
    body: { caller: p.caller },
  }),
  pause_money_out: () => ({ method: 'POST', path: '/api/money-out/pause', body: {} }),
  remove_payout_address: (p) => ({ method: 'DELETE', path: `/api/money-out/addresses/${encodeURIComponent(String(p.addressId))}` }),
  edit_listing: (p) => {
    const { listingId, ...body } = p;
    return { method: 'POST', path: `/api/listings/${listingId}/edit`, body };
  },
  stop_agent_bid: (p) => ({ method: 'POST', path: '/api/agents/seller/bids/abandon', body: { jobId: p.jobId } }),
  confirm_goods_received: (p) => ({ method: 'POST', path: '/api/trade/pod/accept-circle', body: { address: p.address, invoiceId: p.invoiceId, podHash: p.podHash } }),
  make_offer: (p) => ({ method: 'POST', path: `/api/jobs/${p.jobId}/offers`, body: { priceUsdc: p.priceUsdc, deliverByUnix: p.deliverByUnix, note: p.note } }),
  withdraw_offer: (p) => ({ method: 'POST', path: `/api/jobs/${p.jobId}/offers/${p.offerId}/withdraw`, body: {} }),
  lower_offer: (p) => ({ method: 'POST', path: `/api/jobs/${p.jobId}/offers/${p.offerId}/lower`, body: { priceUsdc: p.priceUsdc } }),
  answer_agent_question: (p) => ({
    method: 'POST',
    path: `/api/agent-questions/${encodeURIComponent(String(p.questionId))}/answer`,
    body: { choice: p.choice, ...(p.priceUsdc ? { priceUsdc: p.priceUsdc } : {}) },
  }),
  accept_offer: (p) => ({ method: 'POST', path: `/api/jobs/${p.jobId}/offers/${p.offerId}/accept`, body: {} }),
  near_miss_proceed: (p) => ({ method: 'POST', path: `/api/jobs/${p.jobId}/near-miss`, body: { caller: p.caller, action: 'proceed' } }),
  near_miss_pass: (p) => ({ method: 'POST', path: `/api/jobs/${p.jobId}/near-miss`, body: { caller: p.caller, action: 'decline' } }),
  reconsider_offer: (p) => ({ method: 'POST', path: `/api/jobs/${p.jobId}/reconsider`, body: { caller: p.caller } }),
  change_deal_terms: (p) => {
    const { jobId, as, ...body } = p;
    return { method: 'POST', path: `/api/deals/direct/${jobId}/${as === 'seller' ? 'counter' : 'edit'}`, body };
  },
};

const DONE: Partial<Record<ConfirmAction['intent'], string>> = {
  post_offer: 'Your offer is live.',
  save_setup: 'Saved. Your agents now work this way.',
  save_ways: 'Saved. Your agents now deal this way.',
  create_direct_deal: 'Deal sent. The seller is asked to accept the terms; you pay into escrow after that.',
  fund_direct_deal: 'Paid into escrow. The seller can start the work.',
  set_up_record: 'Your Karwan record is set up.',
  post_request: 'Request posted. Your agent is looking now.',
  release_milestone: 'Payment released.',
  approve_match: 'Match approved. The deal is funded and live.',
  decline_match: 'Declined. Your agent keeps looking.',
  accept_deal: 'Terms agreed. The buyer funds the escrow next.',
  mark_delivered: 'Marked delivered. The buyer has been asked to review and release.',
  cancel_request: 'Request cancelled.',
  cancel_listing: 'Offer taken down.',
  claim_yield: 'Yield claimed.',
  top_up_to_arc: 'Queued. It is not confirmed yet, so check it before you count on it.',
  choose_offer: 'Offer chosen. The escrow is funded and the deal is live.',
  edit_request: 'Request updated.',
  raise_offer: 'Asked for the new price. The buyer approves or declines.',
  request_extension: 'Request sent. The current deadline stands until the buyer answers.',
  respond_extension: 'Answer recorded.',
  dispute_statement: 'Statement submitted.',
  escalate_dispute: 'Sent to review. A Karwan reviewer will rule.',
  raise_problem: 'Problem raised. The payment stays held; each side has 72 hours to give their side.',
  decline_deal: 'Deal turned down. The buyer has your note.',
  goods_arrived: 'Arrival recorded. Your review time has started.',
  review_delivery_myself: 'Done. You review this delivery yourself; your review time has started.',
  claim_payment: 'Payment claimed. It is on its way to you.',
  still_reviewing: 'Review time added. The seller sees you are still checking.',
  delay_appeal: 'Sent. The buyer has to answer or the payment is released to you.',
  answer_delay_appeal: 'Reason sent. The payment stays held until you release it.',
  take_back_deal: 'Deal taken back. Anything you paid in comes back to you.',
  change_deal_terms: 'Sent. The other side sees the new terms.',
  make_offer: 'Offer sent. The buyer sees it now.',
  edit_listing: 'Offer updated.',
  change_settings: 'Settings saved.',
  edit_profile: 'Profile updated.',
  set_x_handle: 'Saved.',
  remove_email: 'Email removed.',
  join_newsletter: 'Signed up. The first email says how to stop them.',
  unlink_telegram: 'Telegram unlinked.',
  set_memory: 'Saved.',
  remove_published_deals: 'Withdrawn. Your record on Karwan stays.',
  set_outside_reads: 'Saved.',
  send_feedback: 'Sent. Thank you; the team reads every note.',
  set_up_agents: 'Your agents are set up.',
  rename_agents: 'Names saved.',
  add_research_credit: 'Research credit added.',
  create_business: 'Business added. Switch to it from your profile.',
  rename_business: 'Renamed.',
  save_trade_line: 'Saved on your company card.',
  remove_trade_line: 'Removed from your company card.',
  edit_company_card: 'Company card updated.',
  test_usdc: 'Asked the faucet. Test USDC usually lands within a minute.',
  test_usdc_on_chain: 'Asked the faucet. Test USDC usually lands within a minute.',
  recheck_money_move: 'Checked again. I will tell you when it arrives.',
  retry_money_move: 'Started again.',
  cancel_money_move: 'Cancelled.',
  recheck_payout: 'Checked. The deal now shows the payment.',
  pause_money_out: 'Paused. No money can leave until you resume it with World ID.',
  remove_payout_address: 'Address removed.',
  stop_agent_bid: 'Your agent stopped bidding on that request.',
  confirm_goods_received: 'Confirmed on the trade record.',
  withdraw_offer: 'Offer withdrawn.',
  lower_offer: 'Offer lowered. The buyer sees the new price.',
  answer_agent_question: 'Done. Your agent has your answer.',
  accept_offer: 'Offer taken. The escrow is paid and the deal is live.',
  near_miss_proceed: 'Done. The deal starts at that price.',
  near_miss_pass: 'Passed. The request stays open for other offers.',
  reconsider_offer: 'Brought back. Say go ahead when you are ready.',
  guarantee_put_up: 'Done. Your deal guarantee is in place.',
  guarantee_take_out: 'Started. Ask me to collect it when it is ready.',
  guarantee_cancel_take_out: 'Kept. It protects your buyers again.',
  guarantee_collect: 'Collected. It is back in your balance.',
  legacy_step: 'Done on the older contract.',
  finance_ask: 'Asked. Financiers can make offers now; I will tell you when one comes in.',
  finance_stop_asking: 'Stopped. Financiers no longer see this deal.',
  finance_accept: 'Done. The advance is on its way to you.',
  finance_reject: 'Turned down. The financier has been told.',
  finance_offer: 'Offer made. The seller sees it now.',
  finance_apply: 'Applied. You are told when the financier desk opens for you.',
  contest_post: 'Your contest is live. I will tell you as entries come in.',
  contest_enter: 'You are in. The buyer sees your preview; your files go to them only if you win.',
  contest_award: 'Paid. The winners have their prize and their files are yours.',
  contest_cancel: 'Taken back. The prize is back with your agent.',
};

const OWN_WALLET_SIGNS = new Set<ConfirmAction['intent']>(['guarantee_put_up', 'guarantee_take_out', 'guarantee_cancel_take_out', 'guarantee_collect', 'legacy_step']);

// Intents whose response carries a money-movement state.
const MOVEMENTS = new Set<ConfirmAction['intent']>(['withdraw_proceeds', 'cash_out', 'fund_agent']);

const ON_KARWAN = 'This step is confirmed on Karwan. Ask me again and I will send you the link.';

function stableBridgeId(actionId: string): string {
  // Stable per card, so a retried request is absorbed by the route's
  // per-bridge idempotency instead of burning twice.
  return `chat-${actionId.replace(/[^a-zA-Z0-9._-]/g, '-')}`.slice(0, 120);
}

/// The chat deal limits are not checked here: every route that pays into
/// escrow asks deals/chatDealGate itself, whatever channel the call came from.
export function createExecutor(deps: {
  call: Call;
  /// Intents this channel never runs from a chat tap. Its money steps are
  /// confirmed on Karwan instead, so a stored card cannot move money here.
  refuse?: ReadonlySet<ConfirmAction['intent']>;
}) {
  const used = new Set<string>();

  return async function executeConfirm(account: { address: string }, action: ConfirmAction): Promise<ExecuteResult> {
    if (deps.refuse?.has(action.intent)) return { ok: false, reason: 'refused', message: ON_KARWAN };
    if (used.has(action.id)) return { ok: false, reason: 'reused', message: 'That is already done.' };
    const p = action.payload as unknown as P;

    if (action.intent === 'accept_deal') {
      used.add(action.id);
      const current = await deps.call(account.address, 'GET', `/api/deals/direct/${p.jobId}?caller=${String(p.caller).toLowerCase()}`);
      const deal = current.json.deal as { agreementVersion?: number; agreementDigest?: string } | undefined;
      if (current.status !== 200 || deal?.agreementVersion == null || !deal.agreementDigest) {
        return { ok: false, reason: 'stale', message: "I couldn't confirm the current terms. Ask me to show the deal again." };
      }
      return finish(action, await deps.call(account.address, 'POST', `/api/deals/direct/${p.jobId}/accept`, {
        caller: p.caller,
        expectedAgreementVersion: deal.agreementVersion,
        expectedAgreementDigest: deal.agreementDigest,
      }));
    }

    const route = ROUTES[action.intent];
    if (!route) return { ok: false, reason: 'refused', message: 'This step needs a wallet signature, so it has to be done in the Karwan app.' };

    // The person's own wallet signs these, which a chat cannot do.
    if (OWN_WALLET_SIGNS.has(action.intent) && p.signer === 'wallet') {
      return { ok: false, reason: 'refused', message: 'Your own wallet signs this, so it is done in the Karwan app. Ask me there.' };
    }

    used.add(action.id);
    if (action.intent === 'fund_direct_deal') return finish(action, await fundDirect(deps.call, account.address, p));
    const step = route(p, action);
    return finish(action, await deps.call(account.address, step.method, step.path, step.body));
  };
}

async function fundDirect(call: Call, address: string, p: P): Promise<{ status: number; json: Record<string, unknown> }> {
  const caller = String(p.caller).toLowerCase();
  const current = await call(address, 'GET', `/api/deals/direct/${p.jobId}?caller=${caller}`);
  const deal = current.json.deal as { agreementVersion?: number; agreementDigest?: string } | undefined;
  if (current.status !== 200 || deal?.agreementVersion == null || !deal.agreementDigest) {
    return { status: 409, json: { error: "I couldn't confirm the current terms. Ask me to show the deal again." } };
  }
  const quoted = await call(address, 'GET', `/api/deals/direct/${p.jobId}/funding-quote?caller=${caller}`);
  const quote = quoted.json.quote as { feeBps?: number; fundedAmountUsdc?: string; quoteFingerprint?: string } | undefined;
  if (quoted.status !== 200 || quote?.feeBps == null || !quote.fundedAmountUsdc || !quote.quoteFingerprint) {
    return { status: 409, json: { error: typeof quoted.json.error === 'string' ? quoted.json.error : 'The deal is not ready to pay yet.' } };
  }
  // Never pay more than the card showed: a higher live total needs a new card.
  if (p.maxFundedAmountUsdc !== undefined && Number(quote.fundedAmountUsdc) > Number(p.maxFundedAmountUsdc)) {
    return { status: 409, json: { error: `The total is now ${quote.fundedAmountUsdc} USDC. Ask me for a new payment card.` } };
  }
  return call(address, 'POST', `/api/deals/direct/${p.jobId}/fund`, {
    caller: p.caller,
    expectedFeeBps: quote.feeBps,
    maxFundedAmountUsdc: quote.fundedAmountUsdc,
    quoteFingerprint: quote.quoteFingerprint,
    expectedAgreementVersion: deal.agreementVersion,
    expectedAgreementDigest: deal.agreementDigest,
  });
}

function finish(action: ConfirmAction, res: { status: number; json: Record<string, unknown> }): ExecuteResult {
  const txHash = typeof res.json.txHash === 'string' ? res.json.txHash : typeof res.json.depositTxHash === 'string' ? res.json.depositTxHash : undefined;
  const error = typeof res.json.error === 'string' ? res.json.error : undefined;

  if (res.json.code === 'CHAT_DEAL_LIMIT' && error) return { ok: false, reason: 'refused', message: error };
  // A PIN or passkey is never asked in a chat: the person confirms on Karwan.
  if (res.status === 428 && res.json.code === 'CONFIRM_REQUIRED') return { ok: false, reason: 'refused', message: ON_KARWAN };
  if (res.status >= 400 && res.status < 500) {
    return { ok: false, reason: 'stale', message: error ?? 'Things changed since I prepared this. Ask me again for the current step.' };
  }
  if (res.status >= 500) {
    return {
      ok: false,
      reason: 'refused',
      message: "I couldn't confirm it went through. Ask me to check before trying again.",
    };
  }
  if (MOVEMENTS.has(action.intent)) {
    const state = String(res.json.movementState ?? '');
    if (state === 'needs_attention' || state === 'cancelled') {
      return { ok: false, reason: 'refused', message: 'This needs attention and is not confirmed. Ask me to check your activity.' };
    }
    if (state !== 'completed') return { ok: true, summary: 'It is being confirmed. It is not complete yet.', ...(txHash ? { txHash } : {}) };
    return { ok: true, summary: 'Completed.', ...(txHash ? { txHash } : {}) };
  }
  return { ok: true, summary: DONE[action.intent] ?? 'Done.', ...(txHash ? { txHash } : {}) };
}
