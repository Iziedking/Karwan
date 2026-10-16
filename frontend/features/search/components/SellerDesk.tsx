'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useActivation } from '@/shared/hooks/useActivation';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { fill } from '@/features/deals/workspace/presentation';
import { ALERT, PRIMARY, QUIET, SECONDARY } from '@/shared/ui/controls';
import { sellerDeskView, type BidLine, type BuyerCheckLine, type SellerDesk as SellerDeskData } from '../sellerDeskView';
import { deskNudges } from '../deskNudges';
import { NudgeStack } from '@/features/jobs/components/AgentNudges';
import { AgentWorldCheck } from '@/features/jobs/components/AgentWorldCheck';
import type { Messages } from '@/shared/i18n/messages';
import { startPlan } from '../startPlan';
import { useStartRun } from '../hooks/useStartRun';
import { StartSheet } from './StartSheet';
import { OfferForm, type OfferDraft } from './OfferForm';

const DESK_POLL_MS = 8_000;

/// The personal seller desk, status first: what needs you, what your agent is
/// bidding on, what you offer. A seller with nothing yet gets the form.
export function SellerDesk() {
  const t = useTranslations().search;
  const auth = useAuth();
  const qc = useQueryClient();
  const activation = useActivation();
  const profile = useUserProfile();
  const me = auth.address ?? '';
  const deskKey = ['search', 'sellerDesk', me];
  const desk = useQuery({
    queryKey: deskKey,
    enabled: !!me,
    staleTime: 15_000,
    refetchInterval: DESK_POLL_MS,
    queryFn: async () => {
      const [seller, matches, listings] = await Promise.all([
        api.seller(me),
        api.matchesFor(me),
        api.listingsForSeller(me),
      ]);
      return sellerDeskView({
        me,
        matches: matches.proposals,
        bids: seller.activeBids,
        recentBids: seller.recentBids ?? [],
        listings: listings.listings,
        worldChecks: seller.worldChecks ?? [],
        now: Date.now(),
      });
    },
  });
  const nudgeCopy = useTranslations().agentNudges;
  const lastDesk = useRef<SellerDeskData | null>(null);
  const [nudges, setNudges] = useState<{ key: string; text: string }[]>([]);
  useEffect(() => {
    if (!desk.data) return;
    const fresh = deskNudges(lastDesk.current, desk.data, nudgeCopy);
    lastDesk.current = desk.data;
    if (fresh.length) {
      const at = Date.now();
      setNudges((list) => [...list, ...fresh.map((text, i) => ({ key: `${at}-${i}`, text }))]);
    }
  }, [desk.data, nudgeCopy]);
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<OfferDraft | null>(null);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [actionError, setActionError] = useState(false);
  const start = useStartRun();

  const plan = startPlan({
    kind: 'offer',
    activated: activation.loading ? null : activation.activated,
    hasRoleProfile: profile.loading ? null : !!profile.profile?.seller,
    topUpNeededUsdc: null,
    balance: null,
    pool: null,
  });

  const finished = start.finished;
  useEffect(() => {
    if (!finished) return;
    setDraft(null);
    setFormOpen(false);
    start.reset();
    void qc.invalidateQueries({ queryKey: ['search', 'sellerDesk', me] });
    // Runs once per finished post.
  }, [finished]);

  const withdraw = async (line: BidLine) => {
    if (withdrawing !== line.jobId) {
      setWithdrawing(line.jobId);
      return;
    }
    setActionError(false);
    try {
      await api.abandonBid(line.jobId);
      await qc.invalidateQueries({ queryKey: deskKey });
    } catch {
      setActionError(true);
    } finally {
      setWithdrawing(null);
    }
  };

  const showForm = formOpen || desk.data?.empty === true;

  return (
    <div className="product-surface mx-auto max-w-[720px] px-4 pb-24 pt-6 sm:px-6">
      <NudgeStack items={nudges} />
      <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[var(--lp-dark)]">{t.seller.title}</h1>
      {actionError ? <p role="alert" className={`${ALERT} mt-4`}>{t.request.error}</p> : null}
      {desk.isError ? (
        <p role="alert" className={`${ALERT} mt-6`}>{t.seller.loadError}</p>
      ) : desk.isPending ? (
        <div aria-busy="true" className="mt-6 h-24 rounded-md bg-[var(--lp-light)] motion-safe:animate-pulse" />
      ) : (
        <div className="divide-y divide-[var(--lp-border-light)] [&>*]:py-8">
          {desk.data.worldChecks.length > 0 ? (
            <section aria-labelledby="world-checks" className="space-y-3">
              <h2 id="world-checks" className="text-[17px] font-semibold text-[var(--lp-dark)]">{nudgeCopy.world.sellerTitle}</h2>
              <ul className="space-y-3">
                {desk.data.worldChecks.map((w) => (
                  <li key={w.jobId} className="space-y-2">
                    <p className="text-[15px] text-[var(--lp-dark)]">
                      {fill(nudgeCopy.world.sellerLine, { title: w.title ?? nudgeCopy.aRequest, amount: w.priceUsdc })}
                    </p>
                    <AgentWorldCheck
                      jobId={w.jobId}
                      caller={me}
                      role="seller"
                      reason={w.reason}
                      skipAllowed={w.skipAllowed}
                      onDone={() => void qc.invalidateQueries({ queryKey: deskKey })}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {desk.data.needsYou.length > 0 ? (
            <section aria-labelledby="needs-you" className="space-y-3">
              <h2 id="needs-you" className="text-[17px] font-semibold text-[var(--lp-dark)]">{t.seller.needsYou}</h2>
              <ul className="divide-y divide-[var(--lp-border-light)]">
                {desk.data.needsYou.map((m) => (
                  <li key={m.jobId} className="flex min-h-14 flex-wrap items-center justify-between gap-3 py-2">
                    <span className="min-w-0 truncate text-[15px] text-[var(--lp-dark)]">{m.title ?? t.request.aRequest}</span>
                    <span className="flex items-center gap-3">
                      <span className="text-[15px] font-semibold tabular-nums text-[var(--lp-dark)]">{m.priceUsdc} USDC</span>
                      <Link href={`/jobs/${m.jobId}`} className={SECONDARY}>{t.seller.accept}</Link>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {desk.data.bidding.length > 0 || !desk.data.empty ? (
            <section aria-labelledby="bidding" className="space-y-3">
              <h2 id="bidding" className="text-[17px] font-semibold text-[var(--lp-dark)]">{t.seller.bidding}</h2>
              {desk.data.bidding.length === 0 ? (
                <p className="text-[14px] text-[var(--lp-text-sub)] font-medium">{t.seller.biddingEmpty}</p>
              ) : (
                <ul className="divide-y divide-[var(--lp-border-light)]">
                  {desk.data.bidding.map((b) => (
                    <li key={b.jobId} className="flex min-h-14 flex-wrap items-center justify-between gap-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] text-[var(--lp-dark)]">{b.title ?? t.request.aRequest}</span>
                        <span className="block text-[14px] text-[var(--lp-text-sub)] font-medium">{t.seller.states[b.state]}</span>
                        {b.check ? <BuyerCheckLines check={b.check} copy={t.seller.buyerCheck} /> : null}
                      </span>
                      <span className="flex items-center gap-3">
                        {b.state === 'passed' ? null : (
                          <span className="text-[15px] font-semibold tabular-nums text-[var(--lp-dark)]">{b.priceUsdc} USDC</span>
                        )}
                        {b.withdrawable ? (
                          <button type="button" className={QUIET} onClick={() => void withdraw(b)}>
                            {withdrawing === b.jobId ? t.seller.withdrawConfirm : t.seller.withdraw}
                          </button>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {!desk.data.empty ? (
            <section aria-labelledby="offers" className="space-y-3">
              <h2 id="offers" className="text-[17px] font-semibold text-[var(--lp-dark)]">{t.seller.offers}</h2>
              {desk.data.offers.length === 0 ? (
                <p className="text-[14px] text-[var(--lp-text-sub)] font-medium">{t.seller.offersEmpty}</p>
              ) : (
                <ul className="divide-y divide-[var(--lp-border-light)]">
                  {desk.data.offers.map((o) => (
                    <li key={o.id} className="flex min-h-14 items-center justify-between gap-3 py-2">
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] text-[var(--lp-dark)]">{o.title}</span>
                        <span className="block text-[14px] text-[var(--lp-text-sub)] font-medium">{fill(t.seller.daysLeft, { days: o.daysLeft })}</span>
                      </span>
                      <span className="shrink-0 text-[15px] font-semibold tabular-nums text-[var(--lp-dark)]">{o.priceUsdc} USDC</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          <section aria-labelledby="post-offer" className="space-y-4">
            {showForm ? (
              <>
                <h2 id="post-offer" className="text-[17px] font-semibold text-[var(--lp-dark)]">{t.offer.title}</h2>
                <OfferForm onSubmit={setDraft} />
              </>
            ) : (
              <button id="post-offer" type="button" className={`${PRIMARY} w-full sm:w-auto`} onClick={() => setFormOpen(true)}>
                {t.seller.post}
              </button>
            )}
          </section>
        </div>
      )}

      <StartSheet
        open={draft !== null}
        onClose={() => {
          if (!start.closable) return;
          setDraft(null);
          start.reset();
        }}
        kind="offer"
        lead={draft ? fill(t.sheet.offerLead, { title: draft.title, amount: draft.askingPriceUsdc }) : ''}
        plan={plan}
        run={start.run}
        closable={start.closable}
        onBegin={() => {
          if (draft && plan.kind === 'ready') start.begin(plan.steps, { kind: 'offer', ...draft }, null);
        }}
        onCheckAgain={() => void start.checkAgain()}
        onTryAgain={() => start.reset()}
      />
    </div>
  );
}

/// What the seller's agent paid to learn about the buyer, as counts. A flag
/// says why the agent wants the seller to look, or why it passed.
function BuyerCheckLines({ check, copy }: { check: BuyerCheckLine; copy: Messages['search']['seller']['buyerCheck'] }) {
  return (
    <span className="mt-1 block text-[14px] font-medium text-[var(--lp-text-sub)]">
      <span className="block">
        {fill(copy.paid, { amount: check.paidUsdc.toFixed(2) })}
        {check.late ? ` · ${copy.late}` : ''}
      </span>
      <span className="block tabular-nums">
        {fill(copy.numbers, { completed: check.completed, repeat: check.repeatSellers, disputes: check.disputesLost, score: check.score })}
      </span>
      {check.flag ? <span className="block font-semibold text-[var(--lp-dark)]">{copy.flags[check.flag]}</span> : null}
    </span>
  );
}
