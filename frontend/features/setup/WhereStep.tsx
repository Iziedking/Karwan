'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { api } from '@/core/api';
import { useMoneyText } from '@/features/money/hooks/useMoneyText';
import { CountrySelect } from '@/features/signup/components/CountrySelect';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { useMyLocation } from '@/shared/places/useMyLocation';
import { cn } from '@/shared/utils/cn';
import type { Reach, SetupAnswers, SetupPlace } from './setupSteps';

/// "Where are you, and how should we reach you?" (view 39, 19 Nov; Figma
/// 379:878 and 379:1012). Country starts from the account, a town is one tap
/// or "Use my location", and a card shows how many people near them are
/// asking for what they sell when there are three or more.

const SEARCH_WAIT_MS = 200;
const NEARBY_WAIT_MS = 400;

type Nearby = { count: number; rows: Array<{ what: string; budgetUsdc: number | null }> };

export function WhereStep({ answers, what, email, onCountry, onPlace, onReach }: {
  answers: SetupAnswers;
  /// What they sell, or need, as their agent read it: the words the card uses.
  what: string;
  email: string | null;
  onCountry: (country: string) => void;
  onPlace: (place: SetupPlace) => void;
  onReach: (reach: Reach | undefined) => void;
}) {
  const messages = useTranslations();
  const t = messages.setup.quick;
  const { locale } = useLocale();
  const money = useMoneyText({ compact: true });
  const country = answers.place?.country ?? 'NG';
  const city = answers.place?.city ?? '';
  const [typed, setTyped] = useState(city);
  const [open, setOpen] = useState(false);
  const [towns, setTowns] = useState<Array<{ name: string; admin: string }>>([]);
  const [nearby, setNearby] = useState<Nearby | null>(null);
  const listId = useId();
  const box = useRef<HTMLDivElement | null>(null);
  const location = useMyLocation((place) => {
    if (place.country !== country) onCountry(place.country);
    onPlace({ country: place.country, city: place.city, admin: place.admin, point: place.point });
    setTyped(place.city);
    setOpen(false);
  });

  useEffect(() => setTyped(city), [city]);

  // A tap anywhere else closes the list, keeping the town already picked.
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) {
        setOpen(false);
        setTyped(city);
      }
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open, city]);

  // Towns as typed, for the chosen country only.
  useEffect(() => {
    if (!open) return;
    let live = true;
    const id = window.setTimeout(() => {
      api.placesSearch(country, typed.trim()).then((r) => { if (live) setTowns(Array.isArray(r?.towns) ? r.towns : []); }).catch(() => { if (live) setTowns([]); });
    }, SEARCH_WAIT_MS);
    return () => { live = false; window.clearTimeout(id); };
  }, [open, typed, country]);

  // The card: only real counts, and nothing at all when the market cannot be read.
  const role = answers.role === 'buy' ? 'buy' : 'sell';
  const line = (role === 'sell' ? answers.sellLine : answers.buyLine)?.trim() ?? '';
  useEffect(() => {
    setNearby(null);
    if (!city || line.length < 2) return;
    let live = true;
    const id = window.setTimeout(() => {
      api.setupNearby({ role, line, country, city }).then((r) => { if (live) setNearby(r && r.count > 0 && Array.isArray(r.rows) ? r : null); }).catch(() => {});
    }, NEARBY_WAIT_MS);
    return () => { live = false; window.clearTimeout(id); };
  }, [role, line, country, city]);

  const pick = (name: string, admin?: string) => {
    onPlace({ country, city: name, ...(admin ? { admin } : {}) });
    setTyped(name);
    setOpen(false);
  };
  const exact = towns.some((town) => town.name.toLocaleLowerCase(locale) === typed.trim().toLocaleLowerCase(locale));
  const telegram = answers.reach === 'telegram' || answers.reach === 'both';
  const byEmail = answers.reach === 'email' || answers.reach === 'both';
  const reachFrom = (tg: boolean, em: boolean): Reach | undefined => (tg && em ? 'both' : tg ? 'telegram' : em ? 'email' : undefined);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <CountrySelect value={country} onChange={onCountry} locale={locale} copy={{ ...messages.startFlow.tag.country, label: t.country }} />
      </div>

      <div ref={box} className="relative">
        <label htmlFor={`${listId}-city`} className="block text-[15px] font-semibold">{t.city}</label>
        <div className={cn('mt-2 flex min-h-14 items-center gap-2.5 rounded-[14px] border bg-[var(--surface)] px-4', open ? 'border-[var(--ink)] shadow-[inset_0_0_0_1px_var(--ink)]' : 'border-[var(--line-strong)]')}>
          <input
            id={`${listId}-city`}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            autoComplete="off"
            value={typed}
            placeholder={t.cityPlaceholder}
            dir="auto"
            onFocus={() => setOpen(true)}
            onChange={(e) => { setTyped(e.target.value); setOpen(true); }}
            className="min-w-0 flex-1 bg-transparent text-[17px] text-[var(--ink)] outline-none"
          />
          {city && !open ? <Icon d="M20 6 9 17l-5-5" label={null} /> : null}
        </div>

        {open ? (
          <ul id={listId} aria-label={t.city} className="mt-2 divide-y divide-[var(--line)] rounded-[16px] border border-[var(--line)] bg-[var(--surface)] px-4">
            <li>
              <button type="button" onClick={location.ask} className="flex min-h-14 w-full items-center gap-3 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]">
                <Icon d={PIN} label={null} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-medium">{location.state === 'finding' ? t.finding : t.useLocation}</span>
                  <span className="block text-[13px] text-[var(--ink-secondary)]">{t.kept}</span>
                </span>
              </button>
            </li>
            {towns.map((town) => (
              <li key={`${town.name}-${town.admin}`}>
                <button type="button" onClick={() => pick(town.name, town.admin)} className="block min-h-14 w-full py-2.5 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]">
                  <span dir="auto" className={cn('block text-[16px]', town.name === city ? 'font-semibold' : 'font-normal')}>{town.name}</span>
                  <span dir="auto" className="block text-[13px] text-[var(--ink-secondary)]">{[town.admin, regionName(country, locale)].filter(Boolean).join(', ')}</span>
                </button>
              </li>
            ))}
            {typed.trim().length >= 2 && !exact ? (
              <li>
                <button type="button" onClick={() => pick(typed.trim())} className="flex min-h-12 w-full items-center text-start text-[15px] font-medium text-[var(--ink-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]">
                  <span dir="auto">{t.keepTyped.replace('{city}', typed.trim())}</span>
                </button>
              </li>
            ) : null}
          </ul>
        ) : (
          <button type="button" onClick={location.ask} disabled={location.state === 'finding'} className="mt-2.5 inline-flex min-h-11 items-center gap-1.5 text-[14px] font-medium text-[var(--ink-secondary)] hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]">
            <Icon d={PIN} label={null} small />
            {location.state === 'finding' ? t.finding : t.useLocation}
          </button>
        )}
        {location.state === 'failed' ? <p role="status" className="mt-1 text-[14px] text-[var(--ink-secondary)]">{t.notFound}</p> : null}
      </div>

      {nearby && city ? (
        <section aria-live="polite" data-nearby className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-4">
          <p className="flex items-center gap-3">
            <span className="text-[32px] font-semibold leading-none tabular-nums">{nearby.count}</span>
            <span dir="auto" className="text-[15px] text-[var(--ink-secondary)]">
              {(role === 'sell' ? t.nearbySell : t.nearbyBuy).replace('{city}', city).replace('{what}', what.toLocaleLowerCase(locale))}
            </span>
          </p>
          {nearby.rows.length ? (
            <ul className="mt-3 divide-y divide-[var(--line)]">
              {nearby.rows.map((row) => (
                <li key={row.what} className="flex items-center gap-3 py-2.5">
                  <span dir="auto" className="min-w-0 flex-1 truncate text-[15px]">{row.what}</span>
                  {row.budgetUsdc ? <span className="shrink-0 text-[15px] font-medium tabular-nums">{money.text(row.budgetUsdc)}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <fieldset>
        <legend className="text-[15px] font-semibold">{t.reachTitle}</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <ReachTile on={telegram} icon={SEND} label="Telegram" note={t.telegramNote} onToggle={() => onReach(reachFrom(!telegram, byEmail))} />
          <ReachTile on={byEmail} icon={MAIL} label={messages.setup.choices.reach.options.email.label} note={email ?? t.emailNote} onToggle={() => onReach(reachFrom(telegram, !byEmail))} />
        </div>
      </fieldset>
    </div>
  );
}

function regionName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

const PIN = 'M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6';
const SEND = 'M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11zM21.854 2.147l-10.94 10.939';
const MAIL = 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm18 3-8.991 5.727a2 2 0 0 1-2.009 0L2 7';

function Icon({ d, label, small = false }: { d: string; label: string | null; small?: boolean }) {
  const size = small ? 16 : 18;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden={label === null} aria-label={label ?? undefined} className="shrink-0">
      <path d={d} />
    </svg>
  );
}

function ReachTile({ on, icon, label, note, onToggle }: { on: boolean; icon: string; label: string; note: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      onClick={onToggle}
      className={cn(
        'flex min-h-[104px] flex-col items-start gap-2 rounded-[16px] border bg-[var(--surface)] p-3.5 text-start transition-colors duration-[180ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]',
        on ? 'border-[var(--ink)] shadow-[inset_0_0_0_1px_var(--ink)]' : 'border-[var(--line-strong)] hover:bg-[var(--raised)]',
      )}
    >
      <span className="flex w-full items-center">
        <Icon d={icon} label={null} />
        <span aria-hidden className={cn('ms-auto grid size-5 place-items-center rounded-[6px] border', on ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--canvas)]' : 'border-[var(--line-strong)]')}>
          {on ? <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg> : null}
        </span>
      </span>
      <span className="text-[16px] font-semibold">{label}</span>
      <span dir="auto" className="text-[13px] leading-snug text-[var(--ink-secondary)] [overflow-wrap:anywhere]">{note}</span>
    </button>
  );
}
