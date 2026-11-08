'use client';

import { useId, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Meet, type StandingNeed, type UserProfile, type UserSettings } from '@/core/api';
import { MoneyInput } from '@/features/money/components/MoneyInput';
import { Price } from '@/features/money/components/Price';
import { ConfirmSheetShell } from '@/shared/components/ConfirmSheetShell';
import { Hint } from '@/shared/components/Hint';
import type { YourAgentCopy } from '@/shared/i18n/messages/yourAgent';
import { cn } from '@/shared/utils/cn';
import { beFoundOf, contactFromOf, meetOf, reachableOf, stepKm, validMeet } from './findModel';

/// The two panels of view 72 on Your agent: Be found, and Let sellers reach me
/// with the needs behind it. Figma: "View 72 · Be found and be reached · 8 Nov".

export type FindPanelKey = 'beFound' | 'reach';
export const NEEDS_KEY = ['standing-needs'] as const;

type F = YourAgentCopy['find'];

function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-12 items-center justify-between gap-4">
      <span className="text-[16px] font-semibold text-[var(--lp-dark)]">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={cn(
          'relative h-[26px] w-11 shrink-0 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]',
          on ? 'border-transparent bg-[var(--lp-dark)]' : 'border-[var(--lp-border-light)] bg-[var(--lp-light)]',
        )}
      >
        <span aria-hidden className={cn('absolute top-[2px] size-5 rounded-full transition-[inset-inline-start]', on ? 'start-[20px] bg-[var(--lp-bg)]' : 'start-[2px] bg-[var(--lp-text-sub)]')} />
      </button>
    </label>
  );
}

function Label({ children, note }: { children: ReactNode; note?: string }) {
  return (
    <p className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--lp-text-sub)]">
      {children}
      {note ? <Hint>{note}</Hint> : null}
    </p>
  );
}

function Check({ on, round, label, note, onChange, extra }: { on: boolean; round?: boolean; label: string; note?: string; onChange: () => void; extra?: ReactNode }) {
  return (
    <div className="flex min-h-14 items-center gap-3 py-1">
      <button
        type="button"
        role={round ? 'radio' : 'checkbox'}
        aria-checked={on}
        onClick={onChange}
        className="flex flex-1 items-center gap-3 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
      >
        <span
          aria-hidden
          className={cn(
            'grid size-[22px] shrink-0 place-items-center border-[1.5px]',
            round ? 'rounded-full' : 'rounded-[6px]',
            on ? 'border-[var(--lp-dark)]' : 'border-[var(--lp-border-light)]',
            on && !round ? 'bg-[var(--lp-dark)] text-[var(--lp-bg)]' : '',
          )}
        >
          {on ? (round ? <span className="size-2.5 rounded-full bg-[var(--lp-dark)]" /> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>) : null}
        </span>
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold text-[var(--lp-dark)]">{label}</span>
          {note ? <span className="block text-[13px] font-medium text-[var(--lp-text-sub)]">{note}</span> : null}
        </span>
      </button>
      {extra}
    </div>
  );
}

function Chips<T extends string>({ value, options, onChange, legend }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; legend: string }) {
  return (
    <div role="radiogroup" aria-label={legend} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'min-h-10 rounded-full border px-3.5 text-[14px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]',
            value === o.value ? 'border-transparent bg-[var(--lp-dark)] text-[var(--lp-bg)]' : 'border-[var(--lp-border-light)] text-[var(--lp-dark)] hover:bg-[var(--lp-light)]',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Buttons({ t, busy, primary, onClose }: { t: YourAgentCopy; busy: boolean; primary: string; onClose: () => void }) {
  return (
    <div className="mt-5 grid gap-2">
      <button type="submit" disabled={busy} className="min-h-12 rounded-full bg-[var(--lp-accent)] px-5 text-[15px] font-semibold text-[var(--accent-ink)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-dark)]">
        {busy ? t.saving : primary}
      </button>
      <button type="button" disabled={busy} onClick={onClose} className="min-h-12 rounded-full border border-[var(--lp-border-light)] px-5 text-[15px] font-semibold text-[var(--lp-dark)] hover:bg-[var(--lp-light)] disabled:opacity-50">
        {t.cancel}
      </button>
    </div>
  );
}

function Sheet({ title, body, busy, error, onClose, onSubmit, children, t, primary }: { title: string; body?: string; busy: boolean; error: string | null; onClose: () => void; onSubmit: () => void; children: ReactNode; t: YourAgentCopy; primary: string }) {
  const id = useId();
  return (
    <ConfirmSheetShell open labelledBy={id} busy={busy} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
        <h2 id={id} className="text-[20px] font-semibold text-[var(--lp-dark)]">{title}</h2>
        {body ? <p className="mt-1 text-[14px] font-medium text-[var(--lp-text-sub)]">{body}</p> : null}
        <div className="mt-4 space-y-4">{children}</div>
        {error ? <p role="alert" className="mt-4 text-[14px] font-medium text-[var(--color-critical)]">{error}</p> : null}
        <Buttons t={t} busy={busy} primary={primary} onClose={onClose} />
      </form>
    </ConfirmSheetShell>
  );
}

/// Saves settings and hands back the profile with them applied.
function useSaveSettings(profile: UserProfile, t: YourAgentCopy, onSaved: (p: UserProfile) => void, onClose: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(change: UserSettings) {
    setBusy(true);
    setError(null);
    try {
      const { settings } = await api.saveSettings(profile.address, change);
      onSaved({ ...profile, settings });
      onClose();
    } catch {
      setError(t.failed);
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, setError, save };
}

export function BeFoundPanel({ profile, t, place, onClose, onSaved }: { profile: UserProfile; t: YourAgentCopy; place: string | null; onClose: () => void; onSaved: (p: UserProfile) => void }) {
  const f = t.find;
  const { busy, error, setError, save } = useSaveSettings(profile, t, onSaved, onClose);
  const [on, setOn] = useState(beFoundOf(profile));
  const [meet, setMeet] = useState<Meet>(meetOf(profile));
  const [from, setFrom] = useState(contactFromOf(profile));
  const km = meet.comeToYouKm ?? 10;
  const stepper = (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-[10px] border border-[var(--lp-border-light)] px-1">
      <button type="button" aria-label="−" disabled={!meet.comeToYouKm} onClick={() => setMeet({ ...meet, comeToYouKm: stepKm(km, false) })} className="grid size-9 place-items-center text-[16px] font-semibold text-[var(--lp-text-sub)] disabled:opacity-40">−</button>
      <span className="min-w-[3.5rem] text-center text-[14px] font-semibold text-[var(--lp-dark)]">{f.km.replace('{n}', String(km))}</span>
      <button type="button" aria-label="+" disabled={!meet.comeToYouKm} onClick={() => setMeet({ ...meet, comeToYouKm: stepKm(km, true) })} className="grid size-9 place-items-center text-[16px] font-semibold text-[var(--lp-text-sub)] disabled:opacity-40">+</button>
    </span>
  );
  return (
    <Sheet title={f.beFound} body={f.beFoundBody} busy={busy} error={error} onClose={onClose} t={t} primary={t.save} onSubmit={() => {
      if (!validMeet(meet)) return setError(f.meetMissing);
      void save({ beFound: on, meet, contactFrom: from });
    }}>
      <Switch on={on} label={f.letFind} onChange={setOn} />
      <div className="border-t border-[var(--lp-border-light)] pt-4">
        <Label note={f.whereNote}>{f.whereYouAre}</Label>
        <p className="mt-1 text-[15px] font-semibold text-[var(--lp-dark)]">{place ?? f.whereNotSet}</p>
      </div>
      <div>
        <Label>{f.howMeet}</Label>
        <div className="mt-1 divide-y divide-[var(--lp-border-light)]">
          <Check on={meet.atMyPlace} label={f.atPlace} note={f.atPlaceNote} onChange={() => setMeet({ ...meet, atMyPlace: !meet.atMyPlace })} />
          <Check on={meet.comeToYouKm !== null} label={f.goTo} note={f.goToNote} onChange={() => setMeet({ ...meet, comeToYouKm: meet.comeToYouKm === null ? 10 : null })} extra={stepper} />
          <Check on={meet.online} label={f.online} note={f.onlineNote} onChange={() => setMeet({ ...meet, online: !meet.online })} />
        </div>
      </div>
      <div>
        <Label>{f.whoAlerts}</Label>
        <div role="radiogroup" aria-label={f.whoAlerts} className="mt-1 divide-y divide-[var(--lp-border-light)]">
          <Check round on={from === 'anyone'} label={f.anyone} onChange={() => setFrom('anyone')} />
          <Check round on={from === 'verified'} label={f.verified} onChange={() => setFrom('verified')} />
        </div>
      </div>
    </Sheet>
  );
}

function NeedForm({ t, need, onDone, onCancel }: { t: YourAgentCopy; need: StandingNeed | null; onDone: () => void; onCancel: () => void }) {
  const f = t.find;
  const [what, setWhat] = useState(need?.what ?? '');
  const [every, setEvery] = useState<StandingNeed['every']>(need?.every ?? 'week');
  const [budget, setBudget] = useState(need?.budgetUsdc ?? '');
  const [kind, setKind] = useState<StandingNeed['kind']>(need?.kind ?? 'goods');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet title={need ? f.changeNeedTitle : f.addNeedTitle} busy={busy} error={error} onClose={onCancel} t={t} primary={need ? t.save : f.addNeedCta} onSubmit={async () => {
      if (what.trim().length < 3) return setError(t.problems.missing);
      setBusy(true);
      setError(null);
      try {
        await api.saveStandingNeed({ ...(need ? { id: need.id } : {}), what: what.trim(), every, budgetUsdc: budget ? Number(budget) : null, kind });
        onDone();
      } catch (e) {
        setError(e instanceof Error && /10 needs/.test(e.message) ? f.tooMany : t.failed);
      } finally {
        setBusy(false);
      }
    }}>
      <label className="block text-[13px] font-semibold text-[var(--lp-text-sub)]">
        {f.needWhat}
        <input value={what} onChange={(e) => setWhat(e.target.value)} maxLength={200} dir="auto" className="form-input mt-1.5 w-full" />
      </label>
      <div className="space-y-2">
        <Label>{f.howOften}</Label>
        <Chips legend={f.howOften} value={every} onChange={setEvery} options={(['once', 'week', 'month', 'season'] as const).map((v) => ({ value: v, label: f.every[v] }))} />
      </div>
      <label className="block text-[13px] font-semibold text-[var(--lp-text-sub)]">
        {f.budgetEach}
        <MoneyInput value={budget} onChange={(usdc) => setBudget(usdc === null ? '' : String(usdc))} className="form-input mt-1.5 w-full" />
      </label>
      <div className="space-y-2">
        <Label>{f.reachesYou}</Label>
        <Chips legend={f.reachesYou} value={kind} onChange={setKind} options={(['goods', 'in_person', 'remote'] as const).map((v) => ({ value: v, label: f.reaches[v] }))} />
      </div>
    </Sheet>
  );
}

function NeedRow({ need, f, onEdit, onToggle, onRemove, busy }: { need: StandingNeed; f: F; onEdit: () => void; onToggle: () => void; onRemove: () => void; busy: boolean }) {
  return (
    <li className="py-3">
      <button type="button" onClick={onEdit} className="block w-full text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]">
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 text-[15px] font-semibold text-[var(--lp-dark)]">{need.what}</span>
          {need.paused ? <span className="rounded-[8px] border border-[var(--lp-border-light)] px-2 py-0.5 text-[13px] font-semibold text-[var(--lp-text-sub)]">{f.paused}</span> : null}
        </span>
        <span className="mt-0.5 block text-[13px] font-medium text-[var(--lp-text-sub)]">
          {f.every[need.every]}
          {need.budgetUsdc ? <> · {f.about.split('{budget}')[0]}<Price usdc={Number(need.budgetUsdc)} size="inline" />{f.about.split('{budget}')[1] ?? ''}</> : null}
          {' · '}{f.reaches[need.kind].toLowerCase()}
        </span>
      </button>
      <span className="mt-2 flex gap-2">
        <button type="button" disabled={busy} onClick={onToggle} className="min-h-9 rounded-full border border-[var(--lp-border-light)] px-3 text-[13px] font-semibold text-[var(--lp-dark)] disabled:opacity-50">{need.paused ? f.resume : f.pause}</button>
        <button type="button" disabled={busy} onClick={onRemove} className="min-h-9 rounded-full border border-[var(--lp-border-light)] px-3 text-[13px] font-semibold text-[var(--lp-dark)] disabled:opacity-50">{f.removeNeed}</button>
      </span>
    </li>
  );
}

export function ReachPanel({ profile, t, onClose, onSaved }: { profile: UserProfile; t: YourAgentCopy; onClose: () => void; onSaved: (p: UserProfile) => void }) {
  const f = t.find;
  const queryClient = useQueryClient();
  const needs = useQuery({ queryKey: NEEDS_KEY, queryFn: () => api.standingNeeds().then((r) => r.needs) });
  const { busy, error, save } = useSaveSettings(profile, t, onSaved, onClose);
  const [on, setOn] = useState(reachableOf(profile));
  const [editing, setEditing] = useState<StandingNeed | 'new' | null>(null);
  const [working, setWorking] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: NEEDS_KEY });
  const act = async (run: () => Promise<unknown>) => {
    setWorking(true);
    try {
      await run();
      await refresh();
    } finally {
      setWorking(false);
    }
  };

  if (editing) {
    return <NeedForm t={t} need={editing === 'new' ? null : editing} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); void refresh(); }} />;
  }
  const list = needs.data ?? [];
  return (
    <Sheet title={f.reach} body={f.reachBody} busy={busy} error={error} onClose={onClose} t={t} primary={t.save} onSubmit={() => void save({ reachable: on })}>
      <Switch on={on} label={f.letReach} onChange={setOn} />
      <div className="border-t border-[var(--lp-border-light)] pt-4">
        <Label note={f.needsNote}>{f.needsLabel}</Label>
        {list.length ? (
          <ul className="mt-1 divide-y divide-[var(--lp-border-light)]">
            {list.map((n) => (
              <NeedRow key={n.id} need={n} f={f} busy={working} onEdit={() => setEditing(n)}
                onToggle={() => void act(() => api.saveStandingNeed({ id: n.id, what: n.what, every: n.every, budgetUsdc: n.budgetUsdc ? Number(n.budgetUsdc) : null, kind: n.kind, paused: !n.paused }))}
                onRemove={() => void act(() => api.removeStandingNeed(n.id))} />
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[14px] font-medium text-[var(--lp-text-sub)]">{needs.isLoading ? '…' : f.noNeeds}</p>
        )}
        {list.length < 10 ? (
          <button type="button" onClick={() => setEditing('new')} className="mt-3 min-h-12 w-full rounded-full border border-[var(--lp-border-light)] px-5 text-[15px] font-semibold text-[var(--lp-dark)] hover:bg-[var(--lp-light)]">
            {f.addNeed}
          </button>
        ) : null}
      </div>
    </Sheet>
  );
}
