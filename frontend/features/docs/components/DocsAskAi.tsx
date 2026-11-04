'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/shared/components/Icon';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { askUrl, docsAiCopy } from '@/shared/i18n/messages/docsAi';

/// The secondary button, smaller and round, so three fit on one phone line.
const BUTTON =
  'inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[var(--line-strong)] px-2.5 text-[14px] font-medium text-[var(--ink)] ' +
  'transition-colors hover:bg-[var(--raised)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] sm:px-3';
const BLOCKS = 'h1,h2,h3,p,li,dt,dd,th,td,summary,figcaption';
const MARK: Record<string, string> = { H1: '# ', H2: '## ', H3: '### ', LI: '- ' };
const SITE = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://karwan.site').replace(/\/$/, '');

/// The page as plain text an AI reads well: headings marked, one block per line,
/// without the buttons and the pager.
function pageAsText(): string {
  const root = document.querySelector<HTMLElement>('[data-docs-content]');
  if (!root) return '';
  const blocks = Array.from(root.querySelectorAll<HTMLElement>(BLOCKS)).filter(
    (el) => !el.closest('[data-ai-skip]') && !el.parentElement?.closest(BLOCKS),
  );
  const body = blocks
    .map((el) => (MARK[el.tagName] ?? '') + (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim())
    .filter((line) => line.trim().length > 2)
    .join('\n\n');
  return `${body}\n\nSource: ${window.location.href}`;
}

/// Copy for AI, Ask Claude and Ask ChatGPT, under every docs title. Quiet
/// buttons: reading the page is the point, so none of them is green.
export function DocsAskAi() {
  const { locale } = useLocale();
  const t = docsAiCopy[locale] ?? docsAiCopy.en;
  const [copied, setCopied] = useState(false);
  const pathname = usePathname();
  /// The page address is in the links from the first paint; the real origin
  /// replaces the site's once the page runs, so a preview links to itself.
  const [origin, setOrigin] = useState(SITE);
  const timer = useRef<number>(0);

  useEffect(() => {
    setOrigin(window.location.origin);
    return () => window.clearTimeout(timer.current);
  }, []);

  const copy = () => {
    navigator.clipboard
      ?.writeText(pageAsText())
      .then(() => {
        setCopied(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  const prompt = t.prompt.replace('{url}', origin + pathname);
  return (
    <div role="group" aria-label={t.group} data-ai-skip className="mt-5 flex flex-wrap gap-2">
      <button type="button" onClick={copy} className={BUTTON} aria-live="polite">
        <Icon name={copied ? 'check' : 'copy'} size={16} aria-hidden />
        {copied ? t.copied : t.copy}
      </button>
      <a href={askUrl('claude', prompt)} target="_blank" rel="noopener noreferrer" className={BUTTON}>
        <span className="sm:hidden">{t.claudeShort}</span>
        <span className="hidden sm:inline">{t.claude}</span>
        <Icon name="arrow-up-right" size={16} directional aria-hidden className="text-[var(--ink-muted)]" />
        <span className="sr-only">({t.newTab})</span>
      </a>
      <a href={askUrl('chatgpt', prompt)} target="_blank" rel="noopener noreferrer" className={BUTTON}>
        <span className="sm:hidden">{t.chatgptShort}</span>
        <span className="hidden sm:inline">{t.chatgpt}</span>
        <Icon name="arrow-up-right" size={16} directional aria-hidden className="text-[var(--ink-muted)]" />
        <span className="sr-only">({t.newTab})</span>
      </a>
    </div>
  );
}
