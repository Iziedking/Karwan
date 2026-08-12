'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import Link from 'next/link';
import { api, ApiError } from '@/core/api';

/// The archive index.
///
/// Empty is a legitimate state and says so plainly rather than pretending to be
/// loading forever. Nothing has gone out until something is worth sending.

interface Row {
  slug: string;
  subject: string;
  preheader: string;
  sentAt: number;
  monthInReview: boolean;
}

export default function NewsletterArchivePage() {
  const pb = useTranslations().pageBits;
  const [issues, setIssues] = useState<Row[] | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    api
      .newsletterArchive()
      .then((r) => setIssues(r.issues))
      .catch((e) => setErr(e instanceof ApiError));
  }, []);

  return (
    <main className="mx-auto max-w-[680px] px-5 py-16 sm:py-24">
      <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink)]/40">[:DISPATCH:]</p>
      <h1 className="mt-3 font-sans text-[28px] sm:text-[34px] font-extrabold leading-[1.15]">
        What we have been doing
      </h1>
      <p className="mt-3 text-[16px] leading-[1.6] text-[var(--ink)]/60">
        Sent when there is real news. Never on a schedule for the sake of it.
      </p>

      <div className="mt-10 space-y-6">
        {issues === null && !err && <p className="text-[14px] text-[var(--ink)]/40">Loading</p>}
        {err && <p className="text-[14px] text-[var(--ink)]/50">{pb.newsletter.couldNotLoadArchive}</p>}
        {issues?.length === 0 && (
          <p className="text-[14px] text-[var(--ink)]/50">
            Nothing yet. The first issue goes out when there is something worth your inbox.
          </p>
        )}

        {issues?.map((issue) => (
          <Link
            key={issue.slug}
            href={`/newsletter/${issue.slug}`}
            className="block border-t border-[var(--ink)]/10 pt-5 group"
          >
            <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink)]/35">
              {new Date(issue.sentAt).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
              {issue.monthInReview ? ' · month in review' : ''}
            </p>
            <h2 className="mt-1.5 font-sans text-[18px] font-extrabold group-hover:text-[var(--accent)] transition">
              {issue.subject}
            </h2>
            <p className="mt-1 text-[14px] text-[var(--ink)]/55">{issue.preheader}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
