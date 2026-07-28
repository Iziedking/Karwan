'use client';
import { useEffect, useState } from 'react';
import { use } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/core/api';

/// One archived issue, at a public url.
///
/// Every issue needs a page that outlives the inbox it landed in: for the "read
/// this in your browser" link, for the Telegram announcement, and for anyone who
/// finds Karwan later and wants to see what we have actually been doing.
///
/// Only sent issues resolve here. The backend looks up through the sent list
/// rather than by id, so there is no url a draft can be reached at.

interface Issue {
  slug: string;
  subject: string;
  preheader: string;
  sentAt: number;
  monthInReview: boolean;
  sections: Array<{ heading: string; body: string }>;
  sources: Array<{ title: string; url: string; source: string; publishedAt: number }>;
}

/// The same light markdown the email renders. Kept deliberately small: bold and
/// links, because that is all the drafter is allowed to produce.
function Body({ text }: { text: string }) {
  const blocks = text.split(/\n\s*\n/).filter((b) => b.trim());

  return (
    <>
      {blocks.map((block, i) => {
        if (block.trim().startsWith('- ')) {
          const items = block.split('\n').filter((l) => l.trim().startsWith('- '));
          return (
            <ul key={i} className="mt-4 space-y-2 list-disc pl-5">
              {items.map((item, j) => (
                <li key={j} className="text-[15px] leading-[1.7] text-[var(--ink)]/80">
                  <Inline text={item.replace(/^\s*-\s*/, '')} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="mt-4 text-[15px] leading-[1.7] text-[var(--ink)]/80">
            <Inline text={block.replace(/\n/g, ' ')} />
          </p>
        );
      })}
    </>
  );
}

function Inline({ text }: { text: string }) {
  // Split on links first, then bold within each remaining run. React escapes
  // everything it renders, so nothing here can inject markup.
  const parts = text.split(/(\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g);

  return (
    <>
      {parts.map((part, i) => {
        const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part);
        if (link) {
          return (
            <a
              key={i}
              href={link[2]}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-[var(--accent)]"
            >
              {link[1]}
            </a>
          );
        }
        const bold = part.split(/(\*\*[^*]+\*\*)/g);
        return (
          <span key={i}>
            {bold.map((b, j) =>
              b.startsWith('**') && b.endsWith('**') ? (
                <strong key={j}>{b.slice(2, -2)}</strong>
              ) : (
                b
              ),
            )}
          </span>
        );
      })}
    </>
  );
}

export default function NewsletterIssuePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [issue, setIssue] = useState<Issue | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .newsletterIssue(slug)
      .then((r) => setIssue(r.issue))
      .catch((e) => setErr(e instanceof ApiError && e.status === 404 ? 'notfound' : 'error'));
  }, [slug]);

  if (err === 'notfound') {
    return (
      <main className="mx-auto max-w-[680px] px-5 py-24">
        <h1 className="font-sans text-[22px] font-extrabold">No such issue</h1>
        <p className="mt-3 text-[15px] text-[var(--ink)]/60">
          This one has either not gone out or never existed.
        </p>
        <Link href="/newsletter" className="mt-6 inline-block text-[13px] underline">
          Every issue
        </Link>
      </main>
    );
  }

  if (err) {
    return (
      <main className="mx-auto max-w-[680px] px-5 py-24">
        <p className="text-[15px] text-[var(--ink)]/60">Could not load this issue.</p>
      </main>
    );
  }

  if (!issue) {
    return (
      <main className="mx-auto max-w-[680px] px-5 py-24">
        <p className="text-[15px] text-[var(--ink)]/40">Loading</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[680px] px-5 py-16 sm:py-24">
      <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink)]/40">
        {issue.monthInReview ? '[:MONTH IN REVIEW:]' : '[:DISPATCH:]'} ·{' '}
        {new Date(issue.sentAt).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}
      </p>

      <h1 className="mt-3 font-sans text-[28px] sm:text-[34px] font-extrabold leading-[1.15]">
        {issue.subject}
      </h1>
      <p className="mt-3 text-[16px] leading-[1.6] text-[var(--ink)]/60">{issue.preheader}</p>

      {issue.sections.map((section) => (
        <section key={section.heading} className="mt-10">
          <h2 className="font-sans text-[18px] font-extrabold">{section.heading}</h2>
          <Body text={section.body} />
        </section>
      ))}

      {issue.sources.length > 0 && (
        <section className="mt-12 border-t border-[var(--ink)]/10 pt-6">
          <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink)]/40">Sources</p>
          <ul className="mt-3 space-y-2">
            {issue.sources.map((s) => (
              <li key={s.url} className="text-[13px] text-[var(--ink)]/50">
                <a href={s.url} target="_blank" rel="noreferrer" className="underline">
                  {s.title}
                </a>{' '}
                · {s.source} · {new Date(s.publishedAt).toISOString().slice(0, 10)}
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link
        href="/newsletter"
        className="mt-12 inline-block mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink)]/50 hover:text-[var(--ink)]"
      >
        Every issue
      </Link>
    </main>
  );
}
