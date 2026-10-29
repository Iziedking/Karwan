'use client';
import { useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { Accent, Punc } from '@/shared/components/Bands';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { ConfirmSheetShell } from '@/shared/components/ConfirmSheetShell';
import { api, ConfirmCancelled, type LegacyStepBody } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useMoneyRefresh } from '@/shared/hooks/useMoneyRefresh';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { useOwnWalletSend } from '@/shared/chain/useOwnWalletSend';
import { formatUsdc } from '@/shared/utils/format';
import { ARC_CHAIN_ID } from '@/features/profile/config';
import { PreviousEscrowDeals } from '@/features/deals/components/PreviousEscrowDeals';
import { useDirectDeals } from '@/features/deals/hooks/useDirectDeals';
import { previousEscrowDeals } from '@/features/deals/previousEscrow';
import { runWalletLegacyCalls } from '@/features/guarantee/walletGuarantee';
import { GUARANTEE_QUERY } from '@/features/guarantee/GuaranteeCard';
import { Pager } from '@/shared/components/Pager';
import { paged } from '@/shared/utils/paged';

const LEGACY_QUERY = ['legacy-positions'] as const;

const row = 'flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] px-4 py-3';
const stepButton = 'inline-flex min-h-11 items-center rounded-full border border-[var(--lp-border-light)] px-4 text-[14px] font-semibold text-[var(--lp-dark)] hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]';
const primary = 'min-h-12 rounded-full bg-[var(--lp-accent)] px-5 text-[15px] font-semibold text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] disabled:opacity-50';
const secondary = 'min-h-12 rounded-full border border-[var(--lp-border-light)] px-5 text-[15px] font-semibold text-[var(--lp-dark)] hover:bg-[var(--lp-light)] disabled:opacity-40';

type Pending = { body: LegacyStepBody; label: string; amountUsdc: string };

export default function LegacyPage() {
  const g = useTranslations().dealGuarantee.legacy.gate;
  return (
    <AuthGuard
      gateTag={g.tag}
      gateTitle={
        <>
          {g.titleBefore} <Accent>{g.titleAccent}</Accent>
          <Punc>.</Punc>
        </>
      }
      gateBody={<>{g.body}</>}
      gateButtonLabel={g.button}
    >
      <LegacyPageInner />
    </AuthGuard>
  );
}

/// Money still on older Karwan contracts (view 37): the deals from before the
/// new escrow, deals on older escrows and guarantees on older contracts, each
/// with the step that works now. Karwan signs for a wallet it holds; an own
/// wallet signs the calls the server simulated for it.
function LegacyPageInner() {
  const { locale, t } = useLocale();
  const c = t.dealGuarantee.legacy;
  const { method } = useAuth();
  const qc = useQueryClient();
  const refreshMoney = useMoneyRefresh();
  const ownWallet = useOwnWalletSend();
  const arc = usePublicClient({ chainId: ARC_CHAIN_ID });
  const sheetId = useId();
  const { data, isPending } = useQuery({ queryKey: LEGACY_QUERY, queryFn: () => api.legacyPositions() });
  const { deals: directDeals, fetchState } = useDirectDeals();
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [dealsAt, setDealsAt] = useState(0);
  const [guaranteesAt, setGuaranteesAt] = useState(0);

  const fill = (text: string, values: Record<string, string>) => text.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? '');
  const day = (unix: number) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(unix * 1000));
  const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

  const deals = data?.deals ?? [];
  const guarantees = data?.guarantees ?? [];
  const dealsPage = paged(deals, dealsAt);
  const guaranteesPage = paged(guarantees, guaranteesAt);
  const nothingLeft = !!data && fetchState === 'success' && deals.length === 0 && guarantees.length === 0 && previousEscrowDeals(directDeals).length === 0;

  const ask = (next: Pending) => {
    setPending(next);
    setError(null);
    setDone(null);
  };

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.legacyStep(pending.body);
      if ('calls' in result) {
        if (method === 'circle' || !arc) throw new Error('no wallet to sign');
        await runWalletLegacyCalls({ calls: result.calls, ownWallet, arcClient: arc, revertedText: t.chainErrors.reverted });
      }
      setDone(fill(c.done, { amount: result.amountUsdc }));
      setPending(null);
      refreshMoney();
      await Promise.all([qc.invalidateQueries({ queryKey: LEGACY_QUERY }), qc.invalidateQueries({ queryKey: GUARANTEE_QUERY })]);
    } catch (err) {
      if (err instanceof ConfirmCancelled) {
        setPending(null);
        return;
      }
      setError(c.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    // One column on the page's own measure, so Back above it lines up with the heading.
    <div className="mx-auto w-full max-w-[var(--workspace-measure)] pb-10">
      <h1 className="text-[32px] font-bold leading-tight tracking-[-0.03em] text-[var(--lp-dark)] sm:text-[40px]">{c.title}</h1>
      <p className="mt-2 max-w-[58ch] text-[16px] font-medium leading-relaxed text-[var(--lp-text-sub)]">{c.hint}</p>
      {isPending ? <p className="mt-4 text-[15px] font-medium text-[var(--lp-text-sub)]">{c.loading}</p> : null}
      {nothingLeft ? <p className="mt-4 text-[15px] font-semibold text-[var(--lp-dark)]">{c.empty}</p> : null}
      {done ? (
        <p role="status" className="mt-5 flex items-center gap-3 rounded-[16px] border border-[var(--lp-accent)] bg-[var(--offer-surface)] px-4 py-3 text-[15px] font-semibold text-[var(--lp-dark)]">
          <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--lp-accent)] text-[var(--accent-ink)]">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          {done}
        </p>
      ) : null}

      <PreviousEscrowDeals />

      {deals.length > 0 ? (
        <section aria-labelledby="legacy-deals" className="mt-10">
          <h2 id="legacy-deals" className="text-[20px] font-bold tracking-[-0.02em] text-[var(--lp-dark)]">{c.olderDeals}</h2>
          <ul className="mt-4 space-y-3">
            {dealsPage.rows.map((d) => (              <li key={`${d.contract}:${d.jobId}`} className={row}>
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold text-[var(--lp-dark)]">{fill(c.withWho, { who: short(d.otherSide) })}</p>
                  <p className="mt-0.5 text-[14px] text-[var(--lp-text-sub)]">
                    {d.role === 'buyer' ? c.asBuyer : c.asSeller} · <span className="tabular-nums">{formatUsdc(d.amountUsdc)}</span> ·{' '}
                    {d.state === 'disputed' ? c.disputed : d.steps.length === 0 && d.role === 'seller' ? c.waitingBuyer : c.funded}
                  </p>
                  {d.heldByKarwan ? <p className="mt-1 text-[14px] font-medium text-[var(--lp-dark)]">{c.heldByKarwan}</p> : null}
                </div>
                {d.heldByKarwan ? null : (
                  <div className="flex flex-wrap gap-2">
                    {d.steps.map((step) => (
                      <button
                        key={step}
                        type="button"
                        className={stepButton}
                        onClick={() => ask({ body: { kind: 'deal', contract: d.contract, ref: d.jobId, step }, label: c.steps[step], amountUsdc: d.amountUsdc })}
                      >
                        {c.steps[step]}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
          <Pager page={dealsPage} label={c.olderDeals} onPage={setDealsAt} />
        </section>
      ) : null}

      {guarantees.length > 0 ? (
        <section id="previous-guarantee" aria-labelledby="legacy-guarantees" className="mt-10 scroll-mt-24">
          <h2 id="legacy-guarantees" className="text-[20px] font-bold tracking-[-0.02em] text-[var(--lp-dark)]">{c.guarantees}</h2>
          <ul className="mt-4 space-y-3">
            {guaranteesPage.rows.map((p) => (                <li key={`${p.contract}:${p.positionId}`} className={row}>
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold tabular-nums text-[var(--lp-dark)]">{formatUsdc(p.amountUsdc)}</p>
                    <p className="mt-0.5 text-[14px] text-[var(--lp-text-sub)]">
                      {p.state === 'in_place'
                        ? c.inPlace
                        : p.readyAt && p.readyAt * 1000 > Date.now()
                          ? fill(c.comingBackOn, { date: day(p.readyAt) })
                          : c.ready}
                      {p.previous ? ` · ${c.previousContract}` : ''}
                    </p>
                    {p.heldByKarwan ? <p className="mt-1 text-[14px] font-medium text-[var(--lp-dark)]">{c.heldByKarwan}</p> : null}
                  </div>
                  {p.heldByKarwan ? null : (
                    <div className="flex flex-wrap gap-2">
                      {p.steps.map((step) => (
                        <button
                          key={step}
                          type="button"
                          className={stepButton}
                          onClick={() => ask({ body: { kind: 'guarantee', contract: p.contract, ref: p.positionId, step }, label: c.steps[step], amountUsdc: p.amountUsdc })}
                        >
                          {c.steps[step]}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              ))}
          </ul>
          <Pager page={guaranteesPage} label={c.guarantees} onPage={setGuaranteesAt} />
        </section>
      ) : null}

      <ConfirmSheetShell open={pending !== null} labelledBy={`${sheetId}-title`} busy={busy} onClose={() => setPending(null)}>
        <h2 id={`${sheetId}-title`} className="text-[20px] font-semibold text-[var(--lp-dark)]">
          {pending?.label}
        </h2>
        <p className="mt-2 text-[16px] font-semibold tabular-nums text-[var(--lp-dark)]">{pending ? formatUsdc(pending.amountUsdc) : null}</p>
        {pending?.body.kind === 'deal' && pending.body.step === 'releaseFinal' ? (
          <p className="mt-3 text-[15px] font-medium leading-relaxed text-[var(--lp-text-sub)]">{c.releaseWarning}</p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-3 text-[14px] font-medium text-[var(--color-critical)]">
            {error}
          </p>
        ) : null}
        <div className="mt-5 grid gap-2">
          <button type="button" className={primary} disabled={busy} aria-busy={busy} onClick={() => void confirm()}>
            {busy ? t.dealGuarantee.sheets.busy : pending?.label}
          </button>
          <button type="button" className={secondary} disabled={busy} onClick={() => setPending(null)}>
            {t.dealGuarantee.sheets.notNow}
          </button>
        </div>
      </ConfirmSheetShell>
    </div>
  );
}
