'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type PassportShare } from '@/core/api';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { passportShareCopy } from '@/shared/i18n/messages/passportShare';
import { cn } from '@/shared/utils/cn';

const SHARES_KEY = ['passport-shares'] as const;

const chip = (active: boolean) =>
  cn(
    'inline-flex min-h-11 items-center rounded-full border px-4 text-[14px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
    active
      ? 'border-[var(--lp-dark)] bg-[var(--lp-dark)] text-[var(--lp-light)]'
      : 'border-[var(--lp-border-light)] bg-[var(--lp-card)] text-[var(--lp-dark)] hover:border-[var(--lp-outline-strong)]',
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
          className="inline-flex min-h-12 items-center rounded-full border border-[var(--lp-outline-strong)] px-5 text-[15px] font-semibold text-[var(--lp-dark)] hover:bg-[var(--lp-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          {t.open}
        </button>
      ) : (
        <div className="rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-5 sm:p-6">
          <h2 id="share-full-record" className="text-[17px] font-semibold text-[var(--lp-dark)]">{t.open}</h2>

          <p className="mt-4 text-[14px] font-medium text-[var(--lp-text-sub)]">{t.who}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" aria-pressed={toPerson} onClick={() => setToPerson(true)} className={chip(toPerson)}>{t.person}</button>
            <button type="button" aria-pressed={!toPerson} onClick={() => setToPerson(false)} className={chip(!toPerson)}>{t.anyone}</button>
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
              className="mt-3 min-h-12 w-full rounded-[14px] border border-[var(--lp-border-light)] bg-[var(--lp-bg,transparent)] px-4 text-[16px] text-[var(--lp-dark)] placeholder:text-[var(--lp-text-sub)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            />
          ) : null}

          <p className="mt-4 text-[14px] font-medium text-[var(--lp-text-sub)]">{t.howLong}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" aria-pressed={hours === 24} onClick={() => setHours(24)} className={chip(hours === 24)}>{t.day}</button>
            <button type="button" aria-pressed={hours === 168} onClick={() => setHours(168)} className={chip(hours === 168)}>{t.week}</button>
          </div>

          <button
            type="button"
            onClick={submit}
            disabled={create.isPending}
            className="mt-5 inline-flex min-h-12 items-center rounded-[10px] bg-[var(--accent)] px-6 text-[15px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--lp-accent-hover)] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-dark)]"
          >
            {create.isPending ? t.creating : t.create}
          </button>
          {error ? <p role="alert" className="mt-3 text-[14px] font-medium text-[var(--color-critical)]">{error}</p> : null}

          {made ? (
            <div className="mt-5 border-t border-[var(--lp-border-light)] pt-4" aria-live="polite">
              <p className="text-[14px] font-medium text-[var(--lp-dark)]">
                {made.share.with
                  ? t.readyPerson.replace('{tag}', made.share.with).replace('{date}', date(made.share.until))
                  : t.ready.replace('{date}', date(made.share.until))}
              </p>
              <p className="mt-2 break-all rounded-[12px] bg-[var(--lp-light)] px-3 py-2.5 text-[14px] text-[var(--lp-dark)]">{made.link}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => void copy(made.link)} className={chip(false)}>{copied ? t.copied : t.copy}</button>
                {typeof navigator !== 'undefined' && 'share' in navigator ? (
                  <button type="button" onClick={() => void navigator.share({ url: made.link }).catch(() => {})} className={chip(false)}>{t.send}</button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {live.length > 0 ? (
        <div className="mt-5">
          <h3 className="text-[14px] font-medium text-[var(--lp-text-sub)]">{t.live}</h3>
          <ul className="mt-2 divide-y divide-[var(--lp-border-light)] border-y border-[var(--lp-border-light)]">
            {live.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold text-[var(--lp-dark)]">{s.with ?? t.anyoneRow}</p>
                  <p className="text-[14px] font-medium text-[var(--lp-text-sub)]">
                    {t.until.replace('{date}', date(s.until))} · {s.views === 0 ? t.openedNone : s.views === 1 ? t.openedOne : t.opened.replace('{n}', String(s.views))}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => stop.mutate(s.id)}
                  disabled={stop.isPending && stop.variables === s.id}
                  className="inline-flex min-h-11 items-center rounded-full px-3 text-[14px] font-semibold text-[var(--lp-dark)] underline underline-offset-4 hover:bg-[var(--lp-light)] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
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
