'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/core/api';
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
      <div className="flex items-center gap-4">
        <PersonAvatar address={found?.address} name={found?.displayName || data.with.tag} size={56} />
        <div className="min-w-0">
          <h1 className="truncate text-[24px] font-semibold leading-tight text-[var(--lp-ink)]">{found?.displayName || data.with.tag}</h1>
          <p className="mt-1 text-[15px] text-[var(--lp-text-sub)]">{[found?.displayName ? data.with.tag : null, country, tier].filter(Boolean).join(' · ')}</p>
        </div>
      </div>

      <ol className="mt-8 border-t border-[var(--lp-line)]">
        {data.messages.length === 0 ? <li className="py-4 text-[15px] text-[var(--lp-text-sub)]">{t.empty}</li> : null}
        {data.messages.map((m, i) => (
          <li key={`${m.at}-${i}`} className="border-b border-[var(--lp-line)] py-4">
            <p className="text-[14px] text-[var(--lp-text-sub)]">
              <span className="font-semibold text-[var(--lp-ink)]">{m.from === 'you' ? t.you : m.from}</span>
              {' · '}
              <span className="tabular-nums">{time(m.at)}</span>
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-[16px] text-[var(--lp-ink)]">{m.text}</p>
            {m.warning ? <p className="mt-2 text-[14px] font-semibold text-[var(--lp-ink)]">{t.warning}</p> : null}
          </li>
        ))}
      </ol>

      <form onSubmit={send} className="mt-8">
        <label htmlFor="dm-draft" className="sr-only">
          {t.label}
        </label>
        <textarea
          id="dm-draft"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={2000}
          rows={3}
          placeholder={t.placeholder.replace('{tag}', data.with.tag)}
          className="w-full resize-y rounded-[10px] border border-[var(--lp-line)] bg-transparent px-4 py-3 text-[16px] text-[var(--lp-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        />
        {sendError ? (
          <p className="mt-2 text-[14px] text-[var(--lp-ink)]" role="alert">
            {sendError}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[14px] text-[var(--lp-text-sub)]">{t.note}</p>
          <div className="flex flex-wrap gap-3">
          <Link
            href={`/buyer?mode=direct&seller=${encodeURIComponent(data.with.tag)}`}
            className="inline-flex min-h-12 items-center rounded-[10px] border border-[var(--lp-line)] px-5 text-[15px] font-semibold text-[var(--lp-ink)] hover:bg-[var(--lp-light)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            {t.startDeal}
          </Link>
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="inline-flex min-h-12 items-center rounded-[10px] bg-[var(--accent)] px-5 text-[15px] font-semibold text-[var(--accent-ink)] disabled:opacity-50"
          >
            {sending ? t.sending : t.send}
          </button>
          </div>
        </div>
      </form>
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
