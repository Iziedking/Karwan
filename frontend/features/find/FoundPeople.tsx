'use client';
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { FoundPerson } from '@/core/api';
import { Price } from '@/features/money/components/Price';
import { useTierLabels } from '@/features/reputation/useTierLabels';
import { buttonClasses } from '@/shared/components/Button';
import { ConfirmSheetShell } from '@/shared/components/ConfirmSheetShell';
import type { FindPeopleCopy } from '@/shared/i18n/messages/findPeople';
import { daysText, distanceText, fillFind, firstName, meetText, personLine, rankText, reasonsText } from './foundModel';

/// The people an agent found (view 72): photo, name, record line, price and
/// rank in one row; a tap opens the person. Never a score, an area or an address.

export function PersonPhoto({ person, size }: { person: Pick<FoundPerson, 'photo' | 'name'>; size: number }) {
  const [failed, setFailed] = useState(false);
  if (person.photo && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={person.photo} alt="" width={size} height={size} referrerPolicy="no-referrer" style={{ width: size, height: size }} className="shrink-0 rounded-full object-cover" onError={() => setFailed(true)} />
    );
  }
  return (
    <span aria-hidden style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }} className="grid shrink-0 place-items-center rounded-full bg-[var(--raised)] font-semibold text-[var(--ink)]">
      {person.name.trim().charAt(0).toUpperCase() || '·'}
    </span>
  );
}

/// Overlapping photos, the first on top.
export function PhotoStack({ people, size, ring }: { people: FoundPerson[]; size: number; ring: string }) {
  return (
    <span className="flex shrink-0 rtl:flex-row-reverse" aria-hidden>
      {people.map((p, i) => (
        <span key={`${p.tag ?? p.name}-${i}`} style={{ marginInlineStart: i ? -Math.round(size / 3.2) : 0, zIndex: people.length - i }} className={`relative rounded-full ring-2 ${ring}`}>
          <PersonPhoto person={p} size={size} />
        </span>
      ))}
    </span>
  );
}

function VerifiedMark({ label }: { label: string }) {
  return (
    <svg role="img" aria-label={label} width="15" height="15" viewBox="0 0 24 24" fill="none" className="shrink-0 text-[var(--ink-secondary)]">
      <path d="M12 2.5l2.4 1.8 3-.1.9 2.8 2.4 1.8-.9 2.9.9 2.9-2.4 1.8-.9 2.8-3-.1L12 21.5l-2.4-1.8-3 .1-.9-2.8-2.4-1.8.9-2.9-.9-2.9 2.4-1.8.9-2.8 3 .1z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8.5 12.2l2.3 2.3 4.7-4.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Amount({ person, t }: { person: FoundPerson; t: FindPeopleCopy }) {
  return person.priceUsdc ? <Price usdc={Number(person.priceUsdc)} size="inline" /> : <span>{t.askPrice}</span>;
}

export function PersonRow({ person, index, t, onOpen, picked = false, status = null }: {
  person: FoundPerson;
  index: number;
  t: FindPeopleCopy;
  onOpen: () => void;
  /// Picked to be asked: a check on their photo.
  picked?: boolean;
  /// Once asked, where their answer stands, in place of the record line.
  status?: string | null;
}) {
  return (
    <button
      type="button"
      data-found-person
      data-picked={picked || undefined}
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-[12px] px-3.5 py-3.5 text-start transition-colors hover:bg-[var(--raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
    >
      <span className="relative shrink-0">
        <PersonPhoto person={person} size={44} />
        {picked ? (
          <span aria-hidden className="absolute -bottom-0.5 -end-0.5 grid size-5 place-items-center rounded-full bg-[var(--ink)] ring-2 ring-[var(--surface)]">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="var(--surface)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[15px] font-medium text-[var(--ink)]">{person.name}</span>
          {person.verified ? <VerifiedMark label={t.verified} /> : null}
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-[var(--ink-secondary)]">{status ?? personLine(person, t)}</span>
      </span>
      <span className="shrink-0 text-end">
        <span className="block text-[15px] font-semibold text-[var(--ink)]"><Amount person={person} t={t} /></span>
        <span className={`mt-0.5 block text-[13px] ${index === 0 && person.recommended ? 'text-[var(--ink)]' : 'text-[var(--ink-muted)]'}`}>{rankText(index, t)}</span>
      </span>
    </button>
  );
}

/// The people as one card of rows, separated by hairlines.
export function PeopleList({ people, t, onOpen, picked, statusOf }: {
  people: FoundPerson[];
  t: FindPeopleCopy;
  onOpen: (i: number) => void;
  picked?: ReadonlySet<number>;
  statusOf?: (p: FoundPerson) => string | null;
}) {
  return (
    <div className="rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-1">
      {people.map((p, i) => (
        <div key={`${p.tag ?? p.name}-${i}`} className={i ? 'border-t border-[var(--line)]' : undefined}>
          <PersonRow person={p} index={i} t={t} onOpen={() => onOpen(i)} picked={picked?.has(i)} status={statusOf?.(p) ?? null} />
        </div>
      ))}
    </div>
  );
}

export function PersonSheet({ person, t, onClose, pick }: {
  person: FoundPerson | null;
  t: FindPeopleCopy;
  onClose: () => void;
  /// While people can still be picked: Pick or Unpick is the main button.
  pick?: { picked: boolean; full: boolean; onToggle: () => void };
}) {
  const tiers = useTierLabels();
  const p = person;
  const away = p ? distanceText(p.distance, t) : null;
  const ready = p ? daysText(p.days, t) : null;
  const facts: Array<[string, ReactNode]> = p
    ? [
        [t.facts.price, <Amount key="a" person={p} t={t} />],
        ...(ready ? [[t.facts.readyIn, ready] as [string, ReactNode]] : []),
        ...(meetText(p.meet, t) ? [[t.facts.works, meetText(p.meet, t)] as [string, ReactNode]] : []),
        ...(p.reasons.length ? [[t.facts.why, reasonsText(p, t)] as [string, ReactNode]] : []),
      ]
    : [];
  return (
    <ConfirmSheetShell open={!!p} labelledBy="found-person-name" busy={false} onClose={onClose}>
      {p ? (
        <div data-found-sheet className="flex flex-col items-center gap-4 pt-1">
          <PersonPhoto person={p} size={64} />
          <div className="text-center">
            <h2 id="found-person-name" className="text-[20px] font-semibold text-[var(--ink)]">{p.name}</h2>
            <p className="mt-1 text-[13px] text-[var(--ink-secondary)]">
              {[p.tag ? `@${p.tag}` : null, p.verified ? t.verified : null, tiers[p.tier]].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="grid w-full grid-cols-3 gap-2">
            {[
              [p.stars !== null ? p.stars.toFixed(1) : '·', t.tiles.rating],
              [String(p.ratings), t.tiles.deals],
              [away ?? '·', t.tiles.away],
            ].map(([v, l]) => (
              <div key={l} className="rounded-[14px] bg-[var(--surface)] px-2 py-3 text-center">
                <span className="block truncate text-[17px] font-semibold text-[var(--ink)]">{v}</span>
                <span className="block text-[13px] text-[var(--ink-secondary)]">{l}</span>
              </div>
            ))}
          </div>
          <dl className="w-full rounded-[16px] border border-[var(--line)] bg-[var(--surface)] px-1">
            {facts.map(([label, value], i) => (
              <div key={label} className={`flex items-center justify-between gap-4 px-3.5 py-3 ${i ? 'border-t border-[var(--line)]' : ''}`}>
                <dt className="text-[13px] text-[var(--ink-secondary)]">{label}</dt>
                <dd className="text-end text-[13px] font-medium text-[var(--ink)]">{value}</dd>
              </div>
            ))}
          </dl>
          {pick ? (
            <div className="grid w-full gap-2">
              <button type="button" data-pick disabled={!pick.picked && pick.full} onClick={pick.onToggle} className={buttonClasses({ variant: pick.picked ? 'secondary' : 'primary', size: 'lg', className: 'w-full disabled:opacity-50' })}>
                {fillFind(pick.picked ? t.unpick : t.pick, { name: firstName(p.name) })}
              </button>
              {p.tag ? (
                <Link href={`/r/${encodeURIComponent(p.tag)}`} className={buttonClasses({ variant: 'secondary', size: 'lg', className: 'w-full' })}>
                  {t.record}
                </Link>
              ) : null}
            </div>
          ) : p.tag ? (
            <div className="grid w-full gap-2">
              <Link href={`/messages/${encodeURIComponent(p.tag)}`} className={buttonClasses({ variant: 'primary', size: 'lg', className: 'w-full' })}>
                {fillFind(t.message, { name: firstName(p.name) })}
              </Link>
              <Link href={`/r/${encodeURIComponent(p.tag)}`} className={buttonClasses({ variant: 'secondary', size: 'lg', className: 'w-full' })}>
                {t.record}
              </Link>
            </div>
          ) : (
            <button type="button" onClick={onClose} className={buttonClasses({ variant: 'secondary', size: 'lg', className: 'w-full' })}>{t.close}</button>
          )}
        </div>
      ) : null}
    </ConfirmSheetShell>
  );
}
