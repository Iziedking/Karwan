import { randomUUID } from 'node:crypto';
import { formatUnits, parseUnits, type Hex, type TransactionReceipt } from 'viem';
import type { DirectDeal } from '../db/deals.js';
import type { FactoringOffer, FactoringOfferStatus } from '../db/factoring.js';
import { assignTypedData, holdUntil, lineIdFor, openCalls, proveOpen, reserveTypedData, type LineTerms } from '../chain/tradeFinance.js';

/// Get paid now on the escrow family (view 18). The seller's selling agent
/// signs the payout assignment and the hold on their deal guarantee; the
/// financier opens the line, Karwan doing it for a wallet it holds.

export type Receivable = { asset: Hex; seller: Hex; unpaid: bigint; horizon: bigint; open: boolean; financeable: boolean };

export interface FamilyFinancingPorts {
  addresses: { tradeFinance: Hex; vault: Hex; usdc: Hex; chainId: number };
  deal(jobId: string): Promise<DirectDeal | null>;
  receivable(dealId: Hex): Promise<Receivable>;
  /// The free part of the deal guarantee of the person this wallet belongs to.
  freeGuarantee(wallet: Hex): Promise<bigint>;
  /// What the seller can put up from their balance now.
  spendable(deal: DirectDeal): Promise<bigint>;
  /// Whether Karwan holds the seller's wallet, so it can put up a gap for them.
  sellerHeld(deal: DirectDeal): Promise<boolean>;
  sellerReady(deal: DirectDeal): Promise<boolean>;
  balance(address: Hex): Promise<bigint>;
  nextNonce(payee: Hex): Promise<bigint>;
  signAsSeller(walletId: string, address: Hex, typed: unknown): Promise<Hex>;
  putUpGuarantee(i: { deal: DirectDeal; amount: bigint }): Promise<void>;
  executeOpen(i: { walletId: string; financier: Hex; calls: Array<{ to: Hex; data: Hex }>; reference: string }): Promise<{ txHash: Hex }>;
  receipt(hash: Hex): Promise<TransactionReceipt>;
  /// Books the advance on the deal: movement, activity on both sides, the deal's chat and alerts.
  markDealFinanced(jobId: string, offerId: string, txHash: Hex): Promise<void>;
  offers: {
    get(id: string): Promise<FactoringOffer | null>;
    listForDeal(jobId: string): Promise<FactoringOffer[]>;
    create(o: Omit<FactoringOffer, 'createdAt' | 'updatedAt'>): Promise<FactoringOffer>;
    patch(id: string, p: Partial<FactoringOffer>): Promise<FactoringOffer | null>;
    patchIfStatus(id: string, expected: FactoringOfferStatus, p: Partial<FactoringOffer>): Promise<FactoringOffer | null>;
  };
  now(): number;
}

export type Refusal = { refused: string; code: string; gapMicros?: string };

const SIGNATURE_LIFE_S = 86_400;
const BPS = 10_000n;
const MIN_HOLD_BPS = 1_000n;

const same = (a: string | undefined, b: string | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const micros = (usdc: string) => parseUnits(usdc, 6);
const usdc = (m: bigint) => formatUnits(m, 6);
const refuse = (code: string, refused: string, extra: Partial<Refusal> = {}): Refusal => ({ refused, code, ...extra });

/// The Karwan test financier's offer (owner, 29 Oct 2026; follows the ask since
/// 30 Oct): what the seller asked for, at most 80% of what the deal still owes,
/// paid back with 3% of the advance, holding 10% of it. None when that is below
/// the least the seller will take.
export function testFinancierTerms(
  unpaid: bigint,
  ask: { requested?: bigint; least?: bigint } = {},
): { advance: bigint; repay: bigint; stake: bigint } | null {
  const cents = (m: bigint) => (m / 10_000n) * 10_000n;
  const cap = cents((unpaid * 80n) / 100n);
  const advance = ask.requested && cents(ask.requested) < cap ? cents(ask.requested) : cap;
  if (advance <= 0n || (ask.least !== undefined && advance < ask.least)) return null;
  return { advance, repay: advance + (advance * 3n) / 100n, stake: (advance + 9n) / 10n };
}

export function guaranteeGap(stake: bigint, free: bigint): bigint {
  return stake > free ? stake - free : 0n;
}

/// A taken offer blocks the deal: a line that opened, or one waiting on its
/// financier while the seller's signatures still work.
function taken(o: FactoringOffer, now?: number): boolean {
  if (o.rail !== 'family') return false;
  if (o.status === 'accepted') return true;
  return o.status === 'awaiting_financier' && (now === undefined || (o.sellerDeadline ?? 0) > now);
}

export function eligibility(
  deal: DirectDeal,
  r: Receivable,
  ready: boolean,
  offers: FactoringOffer[],
  now?: number,
): { ok: true } | { ok: false; code: 'not_business' | 'not_family' | 'not_financeable' | 'record_not_ready' | 'line_in_progress' } {
  if (deal.tradeLane !== 'finance') return { ok: false, code: 'not_business' };
  if (deal.escrowVersion !== 'suite') return { ok: false, code: 'not_family' };
  if (!r.financeable) return { ok: false, code: 'not_financeable' };
  if (!ready) return { ok: false, code: 'record_not_ready' };
  if (offers.some((o) => taken(o, now))) return { ok: false, code: 'line_in_progress' };
  return { ok: true };
}

const NOT_ELIGIBLE: Record<string, string> = {
  not_business: 'Getting paid early is for business orders.',
  not_family: 'This deal cannot be paid early.',
  not_financeable: 'This deal can be paid early once it is accepted and fully paid in.',
  record_not_ready: 'Your Karwan record is still being set up. Try again in a moment.',
  line_in_progress: 'An offer on this deal is already taken.',
};

/// The line a seller reads when they cannot ask yet. A person with their own
/// wallet gets their record with an Arc transaction they sign (view 27,
/// decision 10), and asking sends none, so the line says where that happens.
export function notEligibleLine(code: string, ownWallet = false): string {
  if (code === 'record_not_ready' && ownWallet) {
    return 'Your Karwan record is not set up yet. Open the deal on the website and ask again; your wallet signs the setup there.';
  }
  return NOT_ELIGIBLE[code] ?? 'This deal cannot be paid early now.';
}

/// Settle once the deal has ended; keep the hold when the deal now runs past it.
export function settleDecision(i: { offer: FactoringOffer; r: Receivable; holdEnd: bigint }): 'settle' | 'keep' | 'wait' {
  if (i.offer.status !== 'accepted' || !i.offer.lineId) return 'wait';
  if (!i.r.open) return 'settle';
  if (i.holdEnd < holdUntil(i.r.horizon)) return 'keep';
  return 'wait';
}

export function createFamilyFinancing(ports: FamilyFinancingPorts) {
  const { tradeFinance, vault, usdc: usdcAddress, chainId } = ports.addresses;
  /// One take at a time per deal, so two taps cannot both put up a guarantee.
  const taking = new Set<string>();

  function termsOf(deal: DirectDeal, o: FactoringOffer): LineTerms {
    return {
      escrow: deal.escrowAddress as Hex,
      dealId: deal.escrowDealId as Hex,
      financier: o.financier as Hex,
      advance: micros(o.offeredAdvanceUsdc),
      repay: micros(o.expectedReturnUsdc),
      stake: BigInt(o.stakeMicros ?? '0'),
    };
  }

  async function accept(o: FactoringOffer, txHash: Hex): Promise<void> {
    await ports.offers.patch(o.id, { status: 'accepted', acceptedAt: ports.now(), advanceTxHash: txHash });
    for (const other of await ports.offers.listForDeal(o.invoiceId)) {
      if (other.id !== o.id && other.status === 'offered') await ports.offers.patch(other.id, { status: 'superseded' });
    }
    await ports.markDealFinanced(o.invoiceId, o.id, txHash);
  }

  function prove(receipt: TransactionReceipt, deal: DirectDeal, o: FactoringOffer): boolean {
    try {
      proveOpen(receipt, { tradeFinance, usdc: usdcAddress, seller: deal.sellerAgentAddress as Hex, terms: termsOf(deal, o), lineId: o.lineId as Hex });
      return true;
    } catch {
      return false;
    }
  }

  async function createFamilyOffer(i: {
    jobId: string;
    financier: string;
    advance: bigint;
    repay: bigint;
    stake: bigint;
    walletId?: string;
    expiresInHours: number;
  }): Promise<{ offer: FactoringOffer } | Refusal> {
    const deal = await ports.deal(i.jobId);
    if (!deal) return refuse('unknown_deal', 'This deal was not found.');
    const parties = [deal.seller, deal.buyer, deal.sellerAgentAddress, deal.buyerAgentAddress];
    if (parties.some((p) => same(p, i.financier))) return refuse('financier_is_party', 'You cannot finance a deal you are part of.');
    const r = await ports.receivable(deal.escrowDealId as Hex);
    const offers = await ports.offers.listForDeal(deal.jobId);
    const ok = eligibility(deal, r, await ports.sellerReady(deal), offers, ports.now());
    if (!ok.ok) return refuse(ok.code, NOT_ELIGIBLE[ok.code]!);
    if (i.advance <= 0n || i.advance > i.repay || i.repay > r.unpaid) {
      return refuse('bad_terms', `The payback must be at least the advance and at most the ${usdc(r.unpaid)} USDC the deal still owes.`);
    }
    if (i.stake * BPS < i.advance * MIN_HOLD_BPS) return refuse('hold_too_low', 'The hold must be at least 10% of the advance.');
    if ((await ports.balance(i.financier as Hex)) < i.advance) {
      return refuse('financier_short', `Your wallet needs ${usdc(i.advance)} USDC before this offer can go out.`);
    }
    for (const mine of offers) {
      if (same(mine.financier, i.financier) && mine.status === 'offered') await ports.offers.patch(mine.id, { status: 'superseded' });
    }
    const now = ports.now();
    const offer = await ports.offers.create({
      id: randomUUID(),
      invoiceId: deal.jobId,
      financier: i.financier.toLowerCase(),
      seller: deal.seller,
      faceValueUsdc: deal.dealAmountUsdc,
      claimableAtOfferUsdc: usdc(r.unpaid),
      offeredAdvanceUsdc: usdc(i.advance),
      expectedReturnUsdc: usdc(i.repay),
      discountBps: Number(((r.unpaid - i.advance) * BPS) / r.unpaid),
      status: 'offered',
      offeredAt: now,
      expiresAt: now + i.expiresInHours * 3_600_000,
      rail: 'family',
      stakeMicros: i.stake.toString(),
      ...(i.walletId ? { financierWalletId: i.walletId } : {}),
    });
    return { offer };
  }

  async function takeOffer(i: { offerId: string; seller: string; putUpGap: boolean }): Promise<{ state: 'accepted'; txHash: Hex } | { state: 'awaiting_financier'; deadline: number } | Refusal> {
    const o = await ports.offers.get(i.offerId);
    if (!o || o.rail !== 'family') return refuse('unknown_offer', 'This offer was not found.');
    if (!same(o.seller, i.seller)) return refuse('not_seller', 'Only the seller can take this offer.');
    if (o.status !== 'offered') return refuse('not_open', 'This offer is no longer open.');
    if (ports.now() > o.expiresAt) {
      await ports.offers.patch(o.id, { status: 'expired' });
      return refuse('expired', 'This offer has expired.');
    }
    if (taking.has(o.invoiceId)) return refuse('line_in_progress', NOT_ELIGIBLE.line_in_progress!);
    taking.add(o.invoiceId);
    try {
      return await take(o, i.putUpGap);
    } finally {
      taking.delete(o.invoiceId);
    }
  }

  async function take(o: FactoringOffer, putUpGap: boolean): Promise<{ state: 'accepted'; txHash: Hex } | { state: 'awaiting_financier'; deadline: number } | Refusal> {
    const deal = await ports.deal(o.invoiceId);
    if (!deal) return refuse('unknown_deal', 'This deal was not found.');
    const r = await ports.receivable(deal.escrowDealId as Hex);
    const ok = eligibility(deal, r, await ports.sellerReady(deal), await ports.offers.listForDeal(deal.jobId), ports.now());
    if (!ok.ok) return refuse(ok.code, NOT_ELIGIBLE[ok.code]!);
    const t = termsOf(deal, o);
    if (t.repay > r.unpaid) {
      return refuse('deal_paid_out', 'This deal has less left to pay than the offer. Ask the financier for a new one.');
    }
    if (!same(r.seller, deal.sellerAgentAddress) || !deal.sellerAgentWalletId) return refuse('seller_mismatch', 'This deal cannot be paid early.');

    const gap = guaranteeGap(t.stake, await ports.freeGuarantee(r.seller));
    if (gap > 0n) {
      const short = refuse('guarantee_short', `Deposit ${usdc(gap)} USDC more into your deal guarantee to take this offer.`, { gapMicros: gap.toString() });
      if (!putUpGap || !(await ports.sellerHeld(deal))) return short;
      if ((await ports.spendable(deal)) < gap) {
        return refuse('balance_short', `Add ${usdc(gap)} USDC to your balance to take this offer.`, { gapMicros: gap.toString() });
      }
      await ports.putUpGuarantee({ deal, amount: gap });
    }

    const nowS = BigInt(Math.floor(ports.now() / 1000));
    const deadline = nowS + BigInt(SIGNATURE_LIFE_S);
    const expiresAt = holdUntil(r.horizon);
    const nonce = await ports.nextNonce(r.seller);
    const lineId = lineIdFor(chainId, tradeFinance, t);
    const wallet = deal.sellerAgentWalletId;
    const assignSig = await ports.signAsSeller(wallet, r.seller, assignTypedData({ chainId, escrow: t.escrow, dealId: t.dealId, payee: r.seller, assignee: t.financier, amount: t.repay, submitter: tradeFinance, nonce, deadline }));
    const reserveSig = await ports.signAsSeller(wallet, r.seller, reserveTypedData({ chainId, vault, family: tradeFinance, ref: lineId, asset: r.asset, amount: t.stake, beneficiary: t.financier, expiresAt, deadline }));
    const sellerDeadline = Number(deadline) * 1000;
    const waiting = await ports.offers.patchIfStatus(o.id, 'offered', {
      status: 'awaiting_financier',
      lineId,
      sellerDeadline,
      sellerSigned: {
        assign: { nonce: nonce.toString(), deadline: deadline.toString(), sig: assignSig },
        reserve: { deadline: deadline.toString(), sig: reserveSig },
        expiresAt: expiresAt.toString(),
      },
    });
    if (!waiting) return refuse('not_open', 'This offer is no longer open.');
    if (!o.financierWalletId) return { state: 'awaiting_financier', deadline: sellerDeadline };

    // A failed open leaves the offer waiting; its signatures stop working after
    // 24 hours, so it lapses on its own and the seller can take another.
    const unproven = refuse('open_unproven', 'The payment could not be confirmed yet. Karwan is checking it.');
    let txHash: Hex;
    try {
      ({ txHash } = await ports.executeOpen({
        walletId: o.financierWalletId,
        financier: t.financier,
        calls: openCalls({ usdc: usdcAddress, tradeFinance, terms: t, signed: waiting.sellerSigned! }),
        reference: `family-financing:${o.id}`,
      }));
    } catch {
      return unproven;
    }
    if (!prove(await ports.receipt(txHash), deal, waiting)) return unproven;
    await accept(waiting, txHash);
    return { state: 'accepted', txHash };
  }

  async function waitingFor(offerId: string, financier: string): Promise<{ o: FactoringOffer; deal: DirectDeal } | Refusal> {
    const o = await ports.offers.get(offerId);
    if (!o || o.rail !== 'family') return refuse('unknown_offer', 'This offer was not found.');
    if (!same(o.financier, financier)) return refuse('not_financier', 'Only the financier who made this offer can pay it.');
    if (o.status !== 'awaiting_financier' || !o.sellerSigned || !o.lineId) return refuse('not_waiting', 'This offer is not waiting for a payment.');
    const deal = await ports.deal(o.invoiceId);
    if (!deal) return refuse('unknown_deal', 'This deal was not found.');
    return { o, deal };
  }

  async function prepareOpenCalls(i: { offerId: string; financier: string }): Promise<{ calls: Array<{ to: Hex; data: Hex }> } | Refusal> {
    const w = await waitingFor(i.offerId, i.financier);
    if ('code' in w) return w;
    if (ports.now() > (w.o.sellerDeadline ?? 0)) {
      await ports.offers.patch(w.o.id, { status: 'expired' });
      return refuse('expired', 'The 24 hours to pay the seller have passed. Nothing was held and nothing moved.');
    }
    const t = termsOf(w.deal, w.o);
    if ((await ports.balance(t.financier)) < t.advance) {
      return refuse('financier_short', `Your wallet needs ${usdc(t.advance)} USDC to pay the seller.`);
    }
    return { calls: openCalls({ usdc: usdcAddress, tradeFinance, terms: t, signed: w.o.sellerSigned! }) };
  }

  async function completeOpen(i: { offerId: string; financier: string; txHash: Hex }): Promise<{ state: 'accepted' } | Refusal> {
    const w = await waitingFor(i.offerId, i.financier);
    if ('code' in w) return w;
    if (!prove(await ports.receipt(i.txHash), w.deal, w.o)) return refuse('open_unproven', 'This transaction did not pay the seller as agreed.');
    await accept(w.o, i.txHash);
    return { state: 'accepted' };
  }

  return { createFamilyOffer, takeOffer, prepareOpenCalls, completeOpen };
}

export type FamilyFinancing = ReturnType<typeof createFamilyFinancing>;
