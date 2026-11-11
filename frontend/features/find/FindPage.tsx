'use client';
import { useEffect, useState } from 'react';
import { useMoneyText } from '@/features/money/hooks/useMoneyText';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, type FindView } from '@/core/api';
import { PriceIn } from '@/features/money/components/Price';
import { buttonClasses } from '@/shared/components/Button';
import { ConfirmSheetShell } from '@/shared/components/ConfirmSheetShell';
import { useAuth } from '@/shared/hooks/useAuth';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { findPeopleCopy, type FindPeopleCopy } from '@/shared/i18n/messages/findPeople';
import { askedText, endsText, fillFind, firstName, PICK_MAX, titleOf } from './foundModel';
import { BuyersFound } from './BuyersFound';
import { PeopleList, PersonSheet, PhotoStack } from './FoundPeople';
import { buyerTopUpHref } from '@/features/money/moneyRoutes';

export const findKey = (id: string) => ['find', id] as const;

/// One find (view 72): the people the agent found, best first. Private to the
/// person who asked. Before anyone is asked, a tap opens a person to pick
/// them, and Ask sends each picked person one message; after, each row says
/// how they answered.
export function FindPage({ id }: { id: string }) {
  const { locale } = useLocale();
  const t = findPeopleCopy[locale as keyof typeof findPeopleCopy] ?? findPeopleCopy.en;
  const find = useQuery({ queryKey: findKey(id), queryFn: () => api.findView(id).then((r) => r.find), staleTime: 30_000, retry: 1 });
  const [open, setOpen] = useState<number | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const f = find.data;
  // Back from topping up the buying agent: the same people picked, the ask open again.
  useEffect(() => {
    const resumed = takeResume(id);
    if (resumed) { setPicked(new Set(resumed)); setConfirming(true); }
  }, [id]);
  const sent = !!f?.jobId;
  const canPick = !!f && !sent && f.status === 'shortlisted';

  const toggle = (i: number) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(i)) next.delete(i);
      else if (next.size < PICK_MAX) next.add(i);
      return next;
    });

  const asked = f ? f.rows.filter((r) => r.asked) : [];
  const n = picked.size;

  return (
    <div data-find-page className="mx-auto w-full max-w-[560px] px-6 pb-40 pt-3">
      {find.isPending ? (
        <p role="status" className="mt-8 text-[15px] text-[var(--ink-secondary)]">{t.loading}</p>
      ) : !f ? (
        <div className="mt-8">
          <p className="text-[15px] text-[var(--ink-secondary)]">{find.error && !/not found|404/i.test(String(find.error)) ? t.failed : t.notFound}</p>
          {find.error && !/not found|404/i.test(String(find.error)) ? (
            <button type="button" onClick={() => void find.refetch()} className={buttonClasses({ variant: 'secondary', size: 'md', className: 'mt-4' })}>{t.retry}</button>
          ) : null}
        </div>
      ) : f.side === 'seller' ? (
        <BuyersFound find={f} t={t} locale={locale} />
      ) : (
        <>
          {sent ? (
            <header data-asked className="mt-4 flex flex-col items-center text-center">
              <PhotoStack people={asked} size={56} ring="ring-[var(--canvas)]" />
              <h1 className="mt-3 text-[26px] font-semibold leading-tight tracking-[-0.01em] text-[var(--ink)]">{asked.length === 1 ? t.askedOne : fillFind(t.askedMany, { n: asked.length })}</h1>
              <p className="mt-1.5 text-[13px] text-[var(--ink-secondary)]">{t.askedSub}</p>
            </header>
          ) : (
            <header className="mt-2">
              <p className="text-[13px] text-[var(--ink-muted)]">{t.privateToYou} · {endsText(f, t, locale)}</p>
              <h1 className="mt-1.5 text-[26px] font-semibold leading-tight tracking-[-0.01em] text-[var(--ink)]">{titleOf(f, t)}</h1>
              <p className="mt-1.5 text-[13px] text-[var(--ink-secondary)]">
                <span className="text-[var(--ink)]">{f.need}</span> · <PriceIn template={t.about} usdc={Number(f.budgetUsdc)} /> · {t.kinds[f.kind]}
              </p>
            </header>
          )}
          <div className="mt-5">
            <PeopleList
              people={sent ? asked : f.rows}
              t={t}
              onOpen={(i) => setOpen(sent ? f.rows.indexOf(asked[i]!) : i)}
              picked={canPick ? picked : undefined}
              statusOf={sent ? (p) => askedText(p, t, locale) : undefined}
            />
          </div>
          {sent && f.jobId ? (
            <div className="mt-6">
              <Link href={`/jobs/${f.jobId}`} className={buttonClasses({ variant: 'primary', size: 'lg', className: 'w-full' })}>{t.reviewOffers}</Link>
            </div>
          ) : null}
          {canPick && n > 0 ? (
            <div data-ask-bar className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 mx-auto w-full max-w-[560px] px-6 lg:bottom-6">
              <div className="rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-3 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
                <div className="mb-2.5 flex items-center justify-between px-1">
                  <PhotoStack people={[...picked].map((i) => f.rows[i]!)} size={24} ring="ring-[var(--surface)]" />
                  <span className="text-[13px] text-[var(--ink-secondary)]">{fillFind(t.picked, { n })}</span>
                </div>
                <button type="button" data-ask onClick={() => setConfirming(true)} className={buttonClasses({ variant: 'primary', size: 'lg', className: 'w-full' })}>
                  {n === 1 ? t.askOne : fillFind(t.askMany, { n })}
                </button>
              </div>
            </div>
          ) : null}
          <PersonSheet
            person={open !== null ? (f.rows[open] ?? null) : null}
            t={t}
            onClose={() => setOpen(null)}
            pick={canPick && open !== null ? { picked: picked.has(open), full: n >= PICK_MAX, onToggle: () => { toggle(open); setOpen(null); } } : undefined}
          />
          <AskSheet open={confirming} find={f} picks={[...picked].sort((a, b) => a - b)} t={t} locale={locale} onClose={() => setConfirming(false)} onSent={() => { setConfirming(false); setPicked(new Set()); }} onTopUp={() => keepResume(id, [...picked])} />
        </>
      )}
    </div>
  );
}

const RESUME_KEY = (id: string) => `karwan:find-ask:${id}`;

function keepResume(id: string, picks: number[]) {
  try { window.sessionStorage.setItem(RESUME_KEY(id), JSON.stringify(picks)); } catch { /* the ask simply reopens empty */ }
}

function takeResume(id: string): number[] | null {
  try {
    const raw = window.sessionStorage.getItem(RESUME_KEY(id));
    window.sessionStorage.removeItem(RESUME_KEY(id));
    const picks: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(picks) && picks.length > 0 && picks.every((n) => Number.isInteger(n) && n >= 0) ? picks.slice(0, PICK_MAX) : null;
  } catch {
    return null;
  }
}

function AskSheet({ open, find, picks, t, locale, onClose, onSent, onTopUp }: {
  open: boolean;
  find: FindView;
  picks: number[];
  t: FindPeopleCopy;
  locale: string;
  onClose: () => void;
  onSent: () => void;
  onTopUp: () => void;
}) {
  const { address } = useAuth();
  const client = useQueryClient();
  const mt = useMoneyText({ compact: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; fund: boolean; topUp?: string } | null>(null);
  const people = picks.map((i) => find.rows[i]!).filter(Boolean);
  const names = people.map((p) => firstName(p.name));
  const namesText = new Intl.ListFormat(locale, { type: 'conjunction' }).format(names);
  const by = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(find.endsAt));

  async function send() {
    if (!address || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.postJob({
        posterAddress: address,
        brief: find.need,
        budgetUsdc: Number(find.budgetUsdc),
        deadlineSeconds: Math.min(90 * 86_400, Math.max(60, Math.round((find.endsAt - Date.now()) / 1000))),
        deliveryKind: find.kind,
        where: find.where,
        find: { id: find.id, picks },
      });
      await client.invalidateQueries({ queryKey: findKey(find.id) });
      onSent();
    } catch (err) {
      const body = err instanceof ApiError ? (err.body as { code?: string; topUpNeededUsdc?: string } | undefined) : undefined;
      if (body?.code === 'FUND_BUYER_AGENT' && body.topUpNeededUsdc) setError({ text: fillFind(t.fundFirst, { amount: mt.text(body.topUpNeededUsdc) }), fund: true, topUp: String(body.topUpNeededUsdc) });
      else setError({ text: t.sendFailed, fund: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConfirmSheetShell open={open} labelledBy="ask-people-title" busy={busy} onClose={onClose}>
      <div data-ask-sheet className="flex flex-col items-center gap-4 pt-1">
        <PhotoStack people={people} size={48} ring="ring-[var(--raised)]" />
        <div className="text-center">
          <h2 id="ask-people-title" className="text-[20px] font-semibold text-[var(--ink)]">{fillFind(t.confirmTitle, { names: namesText })}</h2>
          <p className="mt-1 text-[13px] text-[var(--ink-secondary)]">{t.confirmSub}</p>
        </div>
        <dl className="w-full rounded-[16px] border border-[var(--line)] bg-[var(--surface)] px-1">
          {[
            [t.confirmFacts.need, find.need],
            [t.confirmFacts.budget, <PriceIn key="b" template={t.about} usdc={Number(find.budgetUsdc)} />],
            [t.confirmFacts.by, by],
            [t.confirmFacts.theySee, t.confirmFacts.theySeeValue],
          ].map(([label, value], i) => (
            <div key={String(label)} className={`flex items-center justify-between gap-4 px-3.5 py-3 ${i ? 'border-t border-[var(--line)]' : ''}`}>
              <dt className="shrink-0 text-[13px] text-[var(--ink-secondary)]">{label}</dt>
              <dd className="min-w-0 truncate text-end text-[13px] font-medium text-[var(--ink)]">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-[13px] text-[var(--ink-muted)]">{t.nothingPaid}</p>
        {error ? (
          <p role="alert" className="w-full text-center text-[13px] text-[var(--color-critical)]">
            {error.text}
            {error.fund ? <> <Link href={buyerTopUpHref(error.topUp)} onClick={onTopUp} data-fund-agent className="font-semibold underline">{t.addMoney}</Link></> : null}
          </p>
        ) : null}
        <button type="button" data-send onClick={() => void send()} disabled={busy} className={buttonClasses({ variant: 'primary', size: 'lg', className: 'w-full disabled:opacity-60' })}>
          {busy ? t.sending : picks.length === 1 ? t.sendOne : fillFind(t.sendMany, { n: picks.length })}
        </button>
      </div>
    </ConfirmSheetShell>
  );
}
