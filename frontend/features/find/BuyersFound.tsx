'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { api, type FindView, type FoundLead } from '@/core/api';
import { MoneyInput } from '@/features/money/components/MoneyInput';
import { Price } from '@/features/money/components/Price';
import { buttonClasses } from '@/shared/components/Button';
import { ConfirmSheetShell } from '@/shared/components/ConfirmSheetShell';
import type { FindPeopleCopy } from '@/shared/i18n/messages/findPeople';
import { buyersTitle, endsText, fillFind, leadLine, PITCH_MAX } from './foundModel';

/// The buyers a seller's agent found (view 72, Phase 4): what each needs, how
/// often and how far, never who they are. A regular need is picked and
/// offered for; an open request opens to offer on as any request.

const ICON = (
  <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[var(--ink-secondary)]">
    <path d="M6 7h12l-1 13H7L6 7Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M9 7a3 3 0 0 1 6 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

export function LeadRow({ lead, t, picked = false, onPick, href }: { lead: FoundLead; t: FindPeopleCopy; picked?: boolean; onPick?: () => void; href?: string }) {
  const body = (
    <>
      <span className="relative grid size-11 shrink-0 place-items-center rounded-full bg-[var(--raised)]">
        {ICON}
        {picked ? (
          <span aria-hidden className="absolute -bottom-0.5 -end-0.5 grid size-5 place-items-center rounded-full bg-[var(--ink)] ring-2 ring-[var(--surface)]">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="var(--surface)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-[var(--ink)]">{lead.what}</span>
        <span className="mt-0.5 block truncate text-[13px] text-[var(--ink-secondary)]">{leadLine(lead, t)}</span>
      </span>
      <span className="shrink-0 text-end">
        <span className="block text-[15px] font-semibold text-[var(--ink)]">{lead.budgetUsdc ? <Price usdc={Number(lead.budgetUsdc)} size="inline" /> : t.noBudget}</span>
        <span className="mt-0.5 block text-[13px] text-[var(--ink-muted)]">{lead.pitched ? t.offeredTag : t.leadKind[lead.kind]}</span>
      </span>
    </>
  );
  const cls = 'flex w-full items-center gap-3 rounded-[12px] px-3.5 py-3.5 text-start transition-colors hover:bg-[var(--raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]';
  if (href) return <Link data-found-lead href={href} className={cls}>{body}</Link>;
  return (
    <button type="button" data-found-lead data-picked={picked || undefined} disabled={!onPick} onClick={onPick} aria-pressed={onPick ? picked : undefined} className={`${cls} disabled:cursor-default disabled:hover:bg-transparent`}>
      {body}
    </button>
  );
}

export function BuyersFound({ find, t, locale }: { find: FindView; t: FindPeopleCopy; locale: string }) {
  const leads = find.leads ?? [];
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [offering, setOffering] = useState(false);
  const [sent, setSent] = useState<{ pitched: number; refused: number } | null>(null);
  const open = find.status !== 'ended';
  const toggle = (i: number) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(i)) next.delete(i);
      else if (next.size < PITCH_MAX) next.add(i);
      return next;
    });
  const n = picked.size;

  return (
    <>
      <header className="mt-2">
        <p className="text-[13px] text-[var(--ink-muted)]">{t.privateToYou} · {endsText(find, t, locale)}</p>
        <h1 className="mt-1.5 text-[26px] font-semibold leading-tight tracking-[-0.01em] text-[var(--ink)]">{buyersTitle(leads.length, t)}</h1>
        <p className="mt-1.5 text-[13px] text-[var(--ink-secondary)]">{t.buyersSub}</p>
      </header>
      {sent ? (
        <p role="status" data-pitch-sent className="mt-4 rounded-[14px] bg-[var(--surface)] px-4 py-3 text-[13px] text-[var(--ink)]">
          {sent.pitched ? t.pitchSent : null}{sent.refused ? ` ${fillFind(t.pitchRefused, { n: sent.refused })}` : ''}
        </p>
      ) : null}
      <div className="mt-5 rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-1">
        {leads.map((l, i) => (
          <div key={`${l.kind}-${l.ref}`} className={i ? 'border-t border-[var(--line)]' : undefined}>
            <LeadRow
              lead={l}
              t={t}
              picked={picked.has(i)}
              href={l.kind === 'request' ? `/jobs/${l.ref}` : undefined}
              onPick={l.kind === 'need' && !l.pitched && open ? () => toggle(i) : undefined}
            />
          </div>
        ))}
      </div>
      {n > 0 ? (
        <div data-offer-bar className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 mx-auto w-full max-w-[560px] px-6 lg:bottom-6">
          <div className="rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-3 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
            <p className="mb-2.5 px-1 text-end text-[13px] text-[var(--ink-secondary)]">{fillFind(t.pickedCount, { n })}</p>
            <button type="button" data-offer onClick={() => setOffering(true)} className={buttonClasses({ variant: 'primary', size: 'lg', className: 'w-full' })}>
              {n === 1 ? t.offerOne : fillFind(t.offerMany, { n })}
            </button>
          </div>
        </div>
      ) : null}
      <OfferSheet
        open={offering}
        find={find}
        picks={[...picked].sort((a, b) => a - b)}
        t={t}
        onClose={() => setOffering(false)}
        onSent={(r) => { setOffering(false); setPicked(new Set()); setSent(r); }}
      />
    </>
  );
}

function OfferSheet({ open, find, picks, t, onClose, onSent }: {
  open: boolean;
  find: FindView;
  picks: number[];
  t: FindPeopleCopy;
  onClose: () => void;
  onSent: (r: { pitched: number; refused: number }) => void;
}) {
  const client = useQueryClient();
  const [price, setPrice] = useState<string>('');
  const [days, setDays] = useState('2');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const needs = picks.map((i) => find.leads?.[i]?.what).filter((w): w is string => !!w);
  const n = needs.length;
  const dayCount = Number(days);
  const ready = Number(price) > 0 && Number.isInteger(dayCount) && dayCount >= 1 && dayCount <= 90;

  async function send() {
    if (!ready || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const r = await api.pitchBuyers({ findId: find.id, picks, priceUsdc: String(Math.round(Number(price) * 1e6) / 1e6), days: dayCount, note: note.trim() });
      await client.invalidateQueries({ queryKey: ['find', find.id] });
      onSent({ pitched: r.pitched, refused: r.refused.length });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const label = 'text-[13px] text-[var(--ink-secondary)]';
  return (
    <ConfirmSheetShell open={open} labelledBy="offer-buyers-title" busy={busy} onClose={onClose}>
      <div data-offer-sheet className="flex flex-col gap-4 pt-1">
        <div className="text-center">
          <h2 id="offer-buyers-title" className="text-[20px] font-semibold text-[var(--ink)]">{n === 1 ? t.offerOne : fillFind(t.offerMany, { n })}</h2>
          <p className="mt-1 truncate text-[13px] text-[var(--ink-secondary)]">{needs.join(' · ')}</p>
        </div>
        <div className="grid gap-3 rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-3.5">
          <label className="grid gap-1.5">
            <span className={label}>{t.offerFields.price}</span>
            <MoneyInput value={price} onChange={(usdc) => setPrice(usdc === null ? '' : String(usdc))} ariaLabel={t.offerFields.price} className="form-input w-full" />
          </label>
          <label className="grid gap-1.5">
            <span className={label}>{t.offerFields.days}</span>
            <input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, '').slice(0, 2))} className="form-input w-full" />
          </label>
          <label className="grid gap-1.5">
            <span className={label}>{t.offerFields.note}</span>
            <input value={note} maxLength={280} placeholder={t.offerFields.notePlaceholder} onChange={(e) => setNote(e.target.value)} className="form-input w-full" />
          </label>
          <div className="flex items-center justify-between gap-4 border-t border-[var(--line)] pt-3">
            <span className={label}>{t.offerFields.theySee}</span>
            <span className="text-end text-[13px] font-medium text-[var(--ink)]">{t.offerFields.theySeeValue}</span>
          </div>
        </div>
        <p className="text-center text-[13px] text-[var(--ink-muted)]">{t.offerSub}</p>
        {failed ? <p role="alert" className="text-center text-[13px] text-[var(--color-critical)]">{t.sendFailed}</p> : null}
        <div className="grid gap-2">
          <button type="button" data-send-offer onClick={() => void send()} disabled={!ready || busy} className={buttonClasses({ variant: 'primary', size: 'lg', className: 'w-full disabled:opacity-60' })}>
            {busy ? t.sending : n === 1 ? t.sendBuyersOne : fillFind(t.sendBuyersMany, { n })}
          </button>
          <button type="button" onClick={onClose} disabled={busy} className={buttonClasses({ variant: 'secondary', size: 'lg', className: 'w-full' })}>{t.notNow}</button>
        </div>
      </div>
    </ConfirmSheetShell>
  );
}
