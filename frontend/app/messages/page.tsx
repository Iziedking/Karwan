'use client';

import Link from 'next/link';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { relativeTime } from '@/shared/utils/format';
import { PersonAvatar } from '@/shared/components/PersonAvatar';
import { inboxTag, useMessageInbox } from '@/features/messages/useMessageInbox';

/// Everyone you are talking to by tag, the ones waiting for your answer first.
export default function MessagesInboxPage() {
  const t = useTranslations().directMessages;
  return (
    <AuthGuard gateTag={t.gateTag} gateBody={t.gateBody}>
      <Inbox />
    </AuthGuard>
  );
}

function Inbox() {
  const t = useTranslations().directMessages;
  const { locale } = useLocale();
  const { conversations, loading, error } = useMessageInbox();
  const waiting = conversations.filter((c) => c.yourTurn).length;
  const sorted = [...conversations].sort((a, b) => Number(b.yourTurn) - Number(a.yourTurn) || b.at.localeCompare(a.at));

  return (
    <div className="mx-auto w-full max-w-[680px]">
      <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-[var(--lp-dark)]">{t.inbox.title}</h1>
      <p className="mt-1 text-[14px] font-medium text-[var(--lp-text-sub)]">
        {waiting === 0 ? t.inbox.noneWaiting : waiting === 1 ? t.inbox.waitingOne : t.inbox.waiting.replace('{n}', String(waiting))}
      </p>

      {loading ? (
        <div aria-busy className="mt-6 h-40 rounded-[16px] bg-[var(--lp-card)] motion-safe:animate-pulse" />
      ) : error ? (
        <p role="alert" className="mt-6 text-[15px] text-[var(--lp-text-sub)]">{t.unavailable}</p>
      ) : sorted.length === 0 ? (
        <p className="mt-6 max-w-[48ch] text-[15px] leading-relaxed text-[var(--lp-text-sub)]">{t.inbox.empty}</p>
      ) : (
        <ul className="mt-5 divide-y divide-[var(--lp-border-light)] border-y border-[var(--lp-border-light)]">
          {sorted.map((c) => {
            const tag = inboxTag(c.with);
            const name = tag ? `@${tag}` : t.inbox.member;
            const row = (
              <>
                <PersonAvatar name={tag ?? name} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className={`truncate text-[15px] ${c.yourTurn ? 'font-semibold' : 'font-medium'} text-[var(--lp-dark)]`}>{name}</span>
                    <span className="shrink-0 text-[13px] text-[var(--lp-text-sub)]">{relativeTime(Date.parse(c.at), locale)}</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[14px] text-[var(--lp-text-sub)]">{c.last}</span>
                    {c.yourTurn ? (
                      <span className="shrink-0 rounded-full bg-[color-mix(in_srgb,var(--lp-accent)_22%,transparent)] px-2.5 py-0.5 text-[14px] font-semibold text-[var(--lp-dark)]">{t.inbox.yourTurn}</span>
                    ) : null}
                  </span>
                </span>
              </>
            );
            return (
              <li key={`${c.with}-${c.at}`}>
                {tag ? (
                  <Link href={`/messages/${encodeURIComponent(tag)}`} className="flex min-h-16 items-center gap-3 px-1 py-3 hover:bg-[var(--lp-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]">
                    {row}
                  </Link>
                ) : (
                  <div className="flex min-h-16 items-center gap-3 px-1 py-3">{row}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
