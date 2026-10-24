'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAutoGrow } from '@/shared/hooks/useAutoGrow';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/core/api';
import { Icon } from '@/shared/components/Icon';
import { PersonAvatar } from '@/shared/components/PersonAvatar';
import { ProductBackLink } from '@/shared/components/ProductBackLink';
import { useAuth } from '@/shared/hooks/useAuth';
import { useTierLabels } from '@/features/reputation/useTierLabels';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { refusalText } from './refusal';

type Conversation = Awaited<ReturnType<typeof api.directMessages>>;

/// One conversation with someone by their Karwan tag, before any deal. The
/// other person shows as tag, country and tier; never a city or an address.
export function ConversationView({ tag }: { tag: string }) {
  const { locale, t: all } = useLocale();
  const tierNames = useTierLabels();
  const t = all.directMessages;
  const [data, setData] = useState<Conversation | null>(null);
  const [failure, setFailure] = useState<'missing' | 'error' | null>(null);
  const [draft, setDraft] = useState('');
  const draftRef = useAutoGrow(draft);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();
  // Who the tag belongs to, for the name and photo: the same lookup Send uses.
  const person = useQuery({
    queryKey: ['karwan-tag', tag.toLowerCase()],
    queryFn: () => api.resolveKarwanTag(tag),
    staleTime: 60_000,
  });

  const load = useCallback(() => {
    api
      .directMessages(tag)
      .then((c) => {
        setFailure(null);
        setData(c);
      })
      .catch((err) => setFailure(err instanceof ApiError && err.status === 404 ? 'missing' : 'error'));
  }, [tag]);

  useEffect(load, [load]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setSendError(null);
    try {
      await api.sendDirectMessage(tag, body);
      setDraft('');
      load();
    } catch (err) {
      const body = err instanceof ApiError && err.body && typeof err.body === 'object' ? (err.body as { code?: string; until?: number }) : {};
      setSendError(refusalText(body, Date.now(), data?.with.tag ?? `@${tag}`, t));
    } finally {
      setSending(false);
    }
  }

  if (failure) {
    return (
      <main className="mx-auto w-full max-w-[720px] px-4 py-12">
        <p className="text-[16px] text-[var(--lp-ink)]">{failure === 'missing' ? t.notFound : t.unavailable}</p>
        {failure === 'error' ? (
          <button
            type="button"
            onClick={load}
            className="mt-6 inline-flex min-h-11 items-center rounded-full border border-[var(--lp-line)] px-5 py-2.5 text-[14px] font-semibold text-[var(--lp-ink)]"
          >
            {t.retry}
          </button>
        ) : null}
      </main>
    );
  }
  if (!data) return <main className="mx-auto w-full max-w-[720px] px-4 py-12" aria-busy="true" />;

  const country = data.with.country ? regionName(locale, data.with.country) : null;
  const found = person.data?.found ? person.data : null;
  const tier = tierNames[data.with.tier.toUpperCase() as keyof typeof tierNames] ?? data.with.tier;
  const time = (iso: string) => new Date(iso).toLocaleString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <main className="mx-auto w-full max-w-[720px] px-4 py-6 sm:py-10">
      <div data-own-back className="-ms-2 mb-4 empty:hidden">
        <ProductBackLink pathname={pathname} isAuthenticated={isAuthenticated} />
      </div>
      <section aria-labelledby="dm-with" className="overflow-hidden rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)]">
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--lp-border-light)] px-4 py-3.5 sm:px-5">
          <PersonAvatar address={found?.address} name={found?.displayName || data.with.tag} size={40} />
          <div className="min-w-0 flex-1 basis-[9rem]">
            <h1 id="dm-with" className="truncate text-[15px] font-semibold leading-tight text-[var(--lp-ink)]">{found?.displayName || data.with.tag}</h1>
            <p className="truncate text-[13px] font-medium text-[var(--lp-text-sub)]">{[found?.displayName ? data.with.tag : null, country, tier].filter(Boolean).join(' · ')}</p>
          </div>
          <Link
            href={`/buyer?mode=direct&seller=${encodeURIComponent(data.with.tag)}`}
            className="inline-flex min-h-11 items-center rounded-full border border-[color-mix(in_srgb,var(--lp-accent)_45%,transparent)] bg-[color-mix(in_srgb,var(--lp-accent)_14%,transparent)] px-4 text-[14px] font-bold text-[var(--lp-accent-on-light)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            {t.startDeal}
          </Link>
        </div>

        <ol className="flex flex-col gap-2.5 px-4 py-5 sm:px-5">
          {data.messages.length === 0 ? <li className="py-2 text-[15px] text-[var(--lp-text-sub)]">{t.empty}</li> : null}
          {data.messages.map((m, i) => {
            const mine = m.from === 'you';
            return (
              <li key={`${m.at}-${i}`} className={mine ? 'flex max-w-[85%] flex-col items-end self-end sm:max-w-[70%]' : 'flex max-w-[85%] flex-col items-start self-start sm:max-w-[70%]'}>
                <p className={mine
                  ? 'whitespace-pre-wrap break-words rounded-[18px] rounded-ee-[6px] bg-[var(--lp-accent)] px-3.5 py-2.5 text-[15px] font-medium leading-snug text-[var(--accent-ink)]'
                  : 'whitespace-pre-wrap break-words rounded-[18px] rounded-es-[6px] bg-[var(--tint)] px-3.5 py-2.5 text-[15px] leading-snug text-[var(--lp-ink)]'}
                >
                  <span className="sr-only">{mine ? t.you : m.from}: </span>
                  {m.text}
                </p>
                <span className="mt-1 px-1 text-[13px] tabular-nums text-[var(--lp-text-sub)]">{time(m.at)}</span>
                {m.warning ? (
                  <p role="note" className="mt-2 rounded-[16px] border border-[color-mix(in_srgb,var(--color-warning)_40%,transparent)] bg-[var(--color-warning-soft)] px-3.5 py-3 text-[14px] font-semibold leading-snug text-[var(--lp-ink)]">{t.warning}</p>
                ) : null}
              </li>
            );
          })}
        </ol>

        <form onSubmit={send} className="border-t border-[var(--lp-border-light)] px-3 py-3 sm:px-4">
          <label htmlFor="dm-draft" className="sr-only">
            {t.label}
          </label>
          <div className="flex items-end gap-2 rounded-[26px] border border-[var(--lp-border-light)] bg-[var(--lp-light)] py-1.5 pe-1.5 ps-4">
            <textarea
              ref={draftRef}
              id="dm-draft"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={2000}
              rows={1}
              placeholder={t.placeholder.replace('{tag}', data.with.tag)}
              className="max-h-40 min-h-11 flex-1 resize-none bg-transparent py-2.5 text-[16px] text-[var(--lp-ink)] placeholder:text-[var(--lp-text-sub)] focus-visible:outline-none"
            />
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              aria-label={sending ? t.sending : t.send}
              className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--lp-accent)] text-[var(--accent-ink)] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              <Icon name="return" size={20} />
            </button>
          </div>
          {sendError ? (
            <p className="mt-2 px-2 text-[14px] text-[var(--lp-ink)]" role="alert">
              {sendError}
            </p>
          ) : null}
        </form>
      </section>
    </main>
  );
}

function regionName(locale: string, code: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}
