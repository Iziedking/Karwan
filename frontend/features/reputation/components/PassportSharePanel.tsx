'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type PassportShare } from '@/core/api';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { passportShareCopy } from '@/shared/i18n/messages/passportShare';
import { cn } from '@/shared/utils/cn';
import { buttonClasses } from '@/shared/components/Button';
import { CARD_CLASS } from '@/shared/components/Card';

const SHARES_KEY = ['passport-shares'] as const;

/// Two choices on one track; the picked one sits on the surface (Figma, Batch 9 · Trade record).
const TRACK = 'mt-2 flex gap-1 rounded-[12px] bg-[var(--ash)] p-1';
const choice = (active: boolean) =>
  cn(
    'min-h-11 flex-1 rounded-[9px] px-3 text-[15px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ink)]',
    active
      ? 'bg-[var(--surface)] font-semibold text-[var(--ink)] shadow-[0_0_0_1px_var(--line)]'
      : 'font-medium text-[var(--ink-secondary)] hover:text-[var(--ink)]',
  );

/// The owner shows their full passport to one person by tag, or to anyone with
/// the link, for 24 hours or 7 days, and stops any share at any time (view 29).
export function PassportSharePanel() {
  const { locale } = useLocale();
  const t = passportShareCopy[locale];
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [toPerson, setToPerson] = useState(true);
  const [tag, setTag] = useState('');
  const [hours, setHours] = useState<24 | 168>(24);
  const [made, setMade] = useState<{ link: string; share: PassportShare } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shares = useQuery({ queryKey: SHARES_KEY, queryFn: api.passportShares, staleTime: 30_000 });
  const create = useMutation({
    mutationFn: () => api.sharePassport({ with: toPerson ? tag.trim() : null, hours }),
    onSuccess: (r) => {
      setMade(r);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: SHARES_KEY });
    },
    onError: (err) => setError(err instanceof Error && err.message ? err.message : t.failed),
  });
  const stop = useMutation({
    mutationFn: (id: string) => api.stopPassportShare(id),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: SHARES_KEY }),
  });

  const date = (ms: number) => new Date(ms).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const live = shares.data?.shares ?? [];

  function submit() {
    if (toPerson && !tag.trim()) {
      setError(t.needTag);
      return;
    }
    setMade(null);
    create.mutate();
  }

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked; the link is on screen to select */
    }
  }

  return (
    <section aria-labelledby="share-full-record" className="mt-6">
      {!open ? (
        <button
          type="button"
          id="share-full-record"
          onClick={() => setOpen(true)}
          className={buttonClasses({ size: 'lg', className: 'w-full' })}
        >
          {t.open}
        </button>
      ) : (
        <div className={`${CARD_CLASS} p-5 sm:p-6`}>
          <h2 id="share-full-record" className="text-[17px] font-semibold text-[var(--ink)]">{t.open}</h2>
          {made ? (
            <div className="mt-3" aria-live="polite">
              <p className="text-[15px] text-[var(--ink-secondary)]">
                {made.share.with
                  ? t.readyPerson.replace('{tag}', made.share.with).replace('{date}', date(made.share.until))
                  : t.ready.replace('{date}', date(made.share.until))}
              </p>
              <p className="mt-4 break-all rounded-[var(--radius-input)] border border-[var(--line)] px-4 py-3 text-[15px] text-[var(--ink)] select-all">{made.link}</p>
              <div className="mt-4 flex flex-col gap-2">
                <button type="button" onClick={() => void copy(made.link)} className={buttonClasses({ size: 'lg', className: 'w-full' })}>{copied ? t.copied : t.copy}</button>
                {typeof navigator !== 'undefined' && 'share' in navigator ? (
                  <button type="button" onClick={() => void navigator.share({ url: made.link }).catch(() => {})} className={buttonClasses({ variant: 'secondary', size: 'lg', className: 'w-full' })}>{t.send}</button>
                ) : null}
                <button type="button" onClick={() => { setMade(null); setOpen(false); }} className={buttonClasses({ variant: 'ghost', size: 'lg', className: 'w-full' })}>{t.done}</button>
              </div>
            </div>
          ) : (
            <>
              <p className="mt-4 text-[14px] font-medium text-[var(--ink-secondary)]">{t.who}</p>
              <div className={TRACK}>
                <button type="button" aria-pressed={toPerson} onClick={() => setToPerson(true)} className={choice(toPerson)}>{t.person}</button>
                <button type="button" aria-pressed={!toPerson} onClick={() => setToPerson(false)} className={choice(!toPerson)}>{t.anyone}</button>
              </div>
              {toPerson ? (
                <input
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  placeholder={t.tag}
                  aria-label={t.tag}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={40}
                  className="mt-3 min-h-12 w-full rounded-[var(--radius-input)] border border-[var(--line)] bg-[var(--surface)] px-4 text-[16px] text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:border-[var(--ink)] focus-visible:outline-none"
                />
              ) : null}
              <p className="mt-4 text-[14px] font-medium text-[var(--ink-secondary)]">{t.howLong}</p>
              <div className={TRACK}>
                <button type="button" aria-pressed={hours === 24} onClick={() => setHours(24)} className={choice(hours === 24)}>{t.day}</button>
                <button type="button" aria-pressed={hours === 168} onClick={() => setHours(168)} className={choice(hours === 168)}>{t.week}</button>
              </div>
              {error ? <p role="alert" className="mt-3 text-[14px] font-medium text-[var(--color-critical)]">{error}</p> : null}
              <button
                type="button"
                onClick={submit}
                disabled={create.isPending}
                aria-busy={create.isPending || undefined}
                className={buttonClasses({ size: 'lg', className: 'mt-5 w-full', loading: create.isPending })}
              >
                {create.isPending ? t.creating : t.create}
              </button>
            </>
          )}
        </div>
      )}
      {live.length > 0 ? (
        <div className="mt-5">
          <h3 className="text-[14px] font-medium text-[var(--ink-secondary)]">{t.live}</h3>
          <ul className={`${CARD_CLASS} mt-2 divide-y divide-[var(--line)] px-5`}>
            {live.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold text-[var(--ink)]">{s.with ?? t.anyoneRow}</p>
                  <p className="text-[14px] font-medium text-[var(--ink-secondary)]">
                    {t.until.replace('{date}', date(s.until))} · {s.views === 0 ? t.openedNone : s.views === 1 ? t.openedOne : t.opened.replace('{n}', String(s.views))}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => stop.mutate(s.id)}
                  disabled={stop.isPending && stop.variables === s.id}
                  className="inline-flex min-h-11 items-center px-1 text-[14px] font-semibold text-[var(--ink)] underline underline-offset-4 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ink)]"
                >
                  {t.stop}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
