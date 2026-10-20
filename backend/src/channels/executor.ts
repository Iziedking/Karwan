import { randomUUID } from 'node:crypto';
import type { ConfirmAction } from '../assistant/actions.js';
import type { ExecuteResult } from './dispatch.js';

type Call = (
  address: string,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
) => Promise<{ status: number; json: Record<string, unknown> }>;

type P = Record<string, unknown>;
type Step = { method: 'GET' | 'POST'; path: string; body?: unknown };

/// What each confirm card does, as the web app's own calls (AssistantWidget's
/// executor and core/api.ts). Chat runs these exact routes, so validation,
/// authorization and idempotency are the app's, not a second copy.
const ROUTES: Partial<Record<ConfirmAction['intent'], (p: P, a: ConfirmAction) => Step>> = {
  post_offer: (p) => ({ method: 'POST', path: '/api/listings', body: p }),
  save_setup: (p) => ({ method: 'POST', path: '/api/setup/save', body: { answers: p.answers } }),
  create_direct_deal: (p) => ({
    method: 'POST',
    path: '/api/deals/direct',
    body: {
      buyerAddress: p.buyerAddress,
      sellerAddress: p.sellerAddress,
      dealAmountUsdc: p.dealAmountUsdc,
      terms: p.terms,
      deadlineDays: p.deadlineDays,
      firstReleasePct: 100,
    },
  }),
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
    body: { caller: p.caller, ...(p.deliveryProof ? { deliveryProof: p.deliveryProof } : {}) },
  }),
  cancel_request: (p) => ({ method: 'POST', path: `/api/jobs/${p.jobId}/cancel`, body: { caller: p.caller } }),
  cancel_listing: (p) => ({ method: 'POST', path: `/api/listings/${p.listingId}/cancel`, body: { caller: p.caller } }),
  stake_usdc: (p) => ({ method: 'POST', path: '/api/vault/deposit', body: { address: p.address, amountUsdc: p.amountUsdc, requestId: randomUUID() } }),
  claim_yield: (p) => ({ method: 'POST', path: '/api/yield/claim', body: { address: p.address } }),
  // Placeholder so the route table knows the intent; fundDirect runs it.
  fund_direct_deal: (p) => ({ method: 'POST', path: `/api/deals/direct/${p.jobId}/fund` }),
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
  decline_deal: (p) => ({ method: 'POST', path: `/api/deals/direct/${p.jobId}/decline`, body: { caller: p.caller, note: p.note } }),
};

const DONE: Partial<Record<ConfirmAction['intent'], string>> = {
  post_offer: 'Your offer is live.',
  save_setup: 'Saved. Your agents now work this way.',
  create_direct_deal: 'Deal sent. The seller is asked to accept the terms; you pay into escrow after that.',
  fund_direct_deal: 'Paid into escrow. The seller can start the work.',
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
  decline_deal: 'Deal turned down. The buyer has your note.',
};

// Intents whose response carries a money-movement state.
const MOVEMENTS = new Set<ConfirmAction['intent']>(['withdraw_proceeds', 'cash_out', 'stake_usdc', 'fund_agent']);

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
    if (deps.refuse?.has(action.intent)) {
      return { ok: false, reason: 'refused', message: 'This step is confirmed on Karwan. Ask me again and I will send you the link.' };
    }
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
