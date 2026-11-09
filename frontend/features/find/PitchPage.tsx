'use client';
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, type PitchView } from '@/core/api';
import { Price } from '@/features/money/components/Price';
import { useMoneyText } from '@/features/money/hooks/useMoneyText';
import { buttonClasses } from '@/shared/components/Button';
import { ConfirmSheetShell } from '@/shared/components/ConfirmSheetShell';
import { useAuth } from '@/shared/hooks/useAuth';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { findPeopleCopy, type FindPeopleCopy } from '@/shared/i18n/messages/findPeople';
import { daysText, distanceText, fillFind, firstName } from './foundModel';
import { PersonPhoto } from './FoundPeople';

export const pitchKey = (id: string) => ['pitch', id] as const;

/// A seller's offer for one of the buyer's regular needs (view 72, Phase 4),
/// opened from the message their agent sent. Interested posts the need
/// privately to that seller with their offer on it; the buyer still accepts it.
export function PitchPage({ id }: { id: string }) {
  const { locale } = useLocale();
  const t = findPeopleCopy[locale as keyof typeof findPeopleCopy] ?? findPeopleCopy.en;
  const client = useQueryClient();
  const pitch = useQuery({ queryKey: pitchKey(id), queryFn: () => api.pitchView(id).then((r) => r.pitch), staleTime: 30_000, retry: 1 });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<'not_now' | 'no' | null>(null);
  const [failed, setFailed] = useState(false);
  const p = pitch.data;

  async function answer(a: 'not_now' | 'no') {
    if (busy) return;
    setBusy(a);
    setFailed(false);
    try {
      await api.answerPitch(id, a);
      await client.invalidateQueries({ queryKey: pitchKey(id) });
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  }

  if (pitch.isPending) return <Shell><p role="status" className="mt-8 text-[15px] text-[var(--ink-secondary)]">{t.loading}</p></Shell>;
  if (!p) {
    const missing = !pitch.error || /not found|404/i.test(String(pitch.error));
    return (
      <Shell>
        <p className="mt-8 text-[15px] text-[var(--ink-secondary)]">{missing ? t.pitchGone : t.failed}</p>
        {!missing ? <button type="button" onClick={() => void pitch.refetch()} className={buttonClasses({ variant: 'secondary', size: 'md', className: 'mt-4' })}>{t.retry}</button> : null}
      </Shell>
    );
  }

  const name = firstName(p.seller.name);
  if (p.answer === 'interested' && p.jobId) return <Shell><Posted pitch={p} t={t} /></Shell>;
  const away = distanceText(p.distance, t);
  const ready = daysText(p.days, t);
  const open = p.answer === null && !p.closed;

  return (
    <Shell>
      <header className="mt-2">
        <p className="text-[13px] text-[var(--ink-muted)]">{t.yourNeed}</p>
        <h1 className="mt-1.5 text-[26px] font-semibold leading-tight tracking-[-0.01em] text-[var(--ink)]">{p.what}</h1>
      </header>
      <section data-pitch className="mt-5 flex flex-col items-center gap-4 rounded-[20px] bg-[var(--surface)] p-5">
        <PersonPhoto person={p.seller} size={64} />
        <div className="text-center">
          <h2 className="text-[20px] font-semibold text-[var(--ink)]">{p.seller.name}</h2>
          <p className="mt-1 text-[13px] text-[var(--ink-secondary)]">{[p.seller.tag ? `@${p.seller.tag}` : null, p.seller.verified ? t.verified : null].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2">
          {[
            [p.seller.stars !== null ? p.seller.stars.toFixed(1) : t.newOnKarwan, t.tiles.rating],
            [away ?? '·', t.tiles.away],
          ].map(([v, l]) => (
            <div key={l} className="rounded-[14px] bg-[var(--raised)] px-2 py-3 text-center">
              <span className="block truncate text-[17px] font-semibold text-[var(--ink)]">{v}</span>
              <span className="block text-[13px] text-[var(--ink-secondary)]">{l}</span>
            </div>
          ))}
        </div>
        <dl className="w-full rounded-[16px] border border-[var(--line)] px-1">
          {[
            [t.theirOffer, p.priceUsdc ? <Price key="p" usdc={Number(p.priceUsdc)} size="inline" /> : t.askPrice],
            ...(ready ? [[t.facts.readyIn, ready]] : []),
            ...(p.note ? [[t.noteLabel, p.note]] : []),
          ].map(([label, value], i) => (
            <div key={String(label)} className={`flex items-center justify-between gap-4 px-3.5 py-3 ${i ? 'border-t border-[var(--line)]' : ''}`}>
              <dt className="shrink-0 text-[13px] text-[var(--ink-secondary)]">{label}</dt>
              <dd className="min-w-0 text-end text-[13px] font-medium text-[var(--ink)]">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      {open ? (
        <div className="mt-5 grid gap-2">
          <button type="button" data-interested onClick={() => setConfirming(true)} disabled={!p.priceUsdc || !!busy} className={buttonClasses({ variant: 'primary', size: 'lg', className: 'w-full disabled:opacity-60' })}>{t.interested}</button>
          <button type="button" data-not-now onClick={() => void answer('not_now')} disabled={!!busy} className={buttonClasses({ variant: 'secondary', size: 'lg', className: 'w-full' })}>{t.notNow}</button>
          <button type="button" data-not-interested onClick={() => void answer('no')} disabled={!!busy} className="min-h-11 text-[14px] font-medium text-[var(--ink-secondary)] hover:text-[var(--ink)]">{t.notInterested}</button>
          {failed ? <p role="alert" className="text-center text-[13px] text-[var(--color-critical)]">{t.sendFailed}</p> : null}
        </div>
      ) : (
        <p role="status" data-pitch-answered className="mt-5 text-center text-[13px] text-[var(--ink-secondary)]">
          {p.answer === 'no' ? t.saidNo : p.answer === 'not_now' ? t.saidNotNow : t.pitchGone}
        </p>
      )}
      <AskSheet open={confirming} pitch={p} t={t} name={name} onClose={() => setConfirming(false)} onPosted={async () => { setConfirming(false); await client.invalidateQueries({ queryKey: pitchKey(id) }); }} />
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <div data-pitch-page className="mx-auto w-full max-w-[560px] px-6 pb-40 pt-3">{children}</div>;
}

function Posted({ pitch: p, t }: { pitch: PitchView; t: FindPeopleCopy }) {
  const name = firstName(p.seller.name);
  return (
    <>
      <header data-posted className="mt-4 flex flex-col items-center text-center">
        <PersonPhoto person={p.seller} size={56} />
        <h1 className="mt-3 text-[26px] font-semibold leading-tight tracking-[-0.01em] text-[var(--ink)]">{fillFind(t.postedTitle, { name })}</h1>
        <p className="mt-1.5 text-[13px] text-[var(--ink-secondary)]">{t.postedSub}</p>
      </header>
      <div className="mt-5 flex items-center gap-3 rounded-[16px] border border-[var(--line)] bg-[var(--surface)] px-4 py-3.5">
        <PersonPhoto person={p.seller} size={44} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium text-[var(--ink)]">{p.seller.name}</span>
          <span className="mt-0.5 block truncate text-[13px] text-[var(--ink-secondary)]">{[t.offerWord, daysText(p.days, t)].filter(Boolean).join(' · ')}</span>
        </span>
        <span className="shrink-0 text-[15px] font-semibold text-[var(--ink)]">{p.priceUsdc ? <Price usdc={Number(p.priceUsdc)} size="inline" /> : null}</span>
      </div>
      <div className="mt-6 grid gap-2">
        <Link href={`/jobs/${p.jobId}`} className={buttonClasses({ variant: 'primary', size: 'lg', className: 'w-full' })}>{fillFind(t.reviewOffer, { name })}</Link>
        <Link href="/profile" className={buttonClasses({ variant: 'secondary', size: 'lg', className: 'w-full' })}>{t.backToNeeds}</Link>
      </div>
    </>
  );
}

function AskSheet({ open, pitch: p, t, name, onClose, onPosted }: { open: boolean; pitch: PitchView; t: FindPeopleCopy; name: string; onClose: () => void; onPosted: () => Promise<void> }) {
  const { address } = useAuth();
  const mt = useMoneyText({ compact: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; fund: boolean } | null>(null);

  async function post() {
    if (!address || busy || !p.priceUsdc) return;
    setBusy(true);
    setError(null);
    try {
      await api.postJob({
        posterAddress: address,
        brief: p.what,
        budgetUsdc: Number(p.priceUsdc),
        deadlineSeconds: Math.min(90, (p.days ?? 1) + 3) * 86_400,
        deliveryKind: p.kind,
        pitch: { id: p.id },
      });
      await onPosted();
    } catch (err) {
      const body = err instanceof ApiError ? (err.body as { code?: string; topUpNeededUsdc?: string } | undefined) : undefined;
      if (body?.code === 'FUND_BUYER_AGENT' && body.topUpNeededUsdc) setError({ text: fillFind(t.fundFirst, { amount: mt.text(body.topUpNeededUsdc) }), fund: true });
      else setError({ text: t.sendFailed, fund: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConfirmSheetShell open={open} labelledBy="ask-seller-title" busy={busy} onClose={onClose}>
      <div data-ask-seller className="flex flex-col items-center gap-4 pt-1">
        <PersonPhoto person={p.seller} size={48} />
        <div className="text-center">
          <h2 id="ask-seller-title" className="text-[20px] font-semibold text-[var(--ink)]">{fillFind(t.askFor, { name })}</h2>
          <p className="mt-1 text-[13px] text-[var(--ink-secondary)]">{fillFind(t.askForSub, { name })}</p>
        </div>
        <dl className="w-full rounded-[16px] border border-[var(--line)] bg-[var(--surface)] px-1">
          {[
            [t.confirmFacts.need, p.what],
            [t.theirOffer, <span key="o">{p.priceUsdc ? <Price usdc={Number(p.priceUsdc)} size="inline" /> : null}{p.days ? ` · ${daysText(p.days, t)}` : ''}</span>],
            [t.whoSees, fillFind(t.whoSeesValue, { name })],
            [t.confirmFacts.theySee, t.confirmFacts.theySeeValue],
          ].map(([label, value], i) => (
            <div key={String(label)} className={`flex items-center justify-between gap-4 px-3.5 py-3 ${i ? 'border-t border-[var(--line)]' : ''}`}>
              <dt className="shrink-0 text-[13px] text-[var(--ink-secondary)]">{label}</dt>
              <dd className="min-w-0 truncate text-end text-[13px] font-medium text-[var(--ink)]">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-center text-[13px] text-[var(--ink-muted)]">{t.payNote}</p>
        {error ? (
          <p role="alert" className="w-full text-center text-[13px] text-[var(--color-critical)]">
            {error.text}
            {error.fund ? <> <Link href="/add" className="font-semibold underline">{t.addMoney}</Link></> : null}
          </p>
        ) : null}
        <button type="button" data-post-privately onClick={() => void post()} disabled={busy} className={buttonClasses({ variant: 'primary', size: 'lg', className: 'w-full disabled:opacity-60' })}>
          {busy ? t.sending : t.postPrivately}
        </button>
      </div>
    </ConfirmSheetShell>
  );
}
