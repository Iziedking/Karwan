'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, type MyCaseRow } from '@/core/api';
import { AssistantThread } from '@/shared/assistant/AssistantThread';
import { useAssistantChat } from '@/shared/assistant/useAssistantChat';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { buttonClasses } from '@/shared/components/Button';
import { CARD_CLASS } from '@/shared/components/Card';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { relativeTime } from '@/shared/utils/format';
import { ProfileFrame } from '@/features/profile/ui/ProfileUi';
import { caseTitle, helpPrefill, stateWords } from '@/features/support/casePresentation';

/// Help and support (view 78): the help bot answers from the guide and the
/// person's own account and opens a case when a person is needed; below it,
/// every case on the account. Opened from Profile, or from Get help with this
/// on a deal or a transfer, which starts the bot on that record.
export default function HelpAndSupportPage() {
  const t = useTranslations();
  return (
    <AuthGuard gateTag={t.profile.signInGate.tag} gateBody={t.profile.signInGate.body}>
      <Suspense>
        <HelpAndSupport />
      </Suspense>
    </AuthGuard>
  );
}

function HelpAndSupport() {
  const t = useTranslations();
  const copy = t.supportPage;
  const { locale } = useLocale();
  const params = useSearchParams();
  const prefill = helpPrefill({ deal: params.get('deal'), dealRef: params.get('ref'), transfer: params.get('transfer') }, copy);
  const chat = useAssistantChat({ mode: 'help', viewingDeal: prefill?.viewingDeal ?? null });
  const [input, setInput] = useState(prefill?.text ?? '');
  const [cases, setCases] = useState<MyCaseRow[] | null>(null);
  const answered = useRef(0);

  const loadCases = () => void api.myCases().then((r) => setCases(r.cases)).catch(() => setCases((prev) => prev ?? []));
  useEffect(loadCases, []);
  // A reply from the bot may have opened a case: read the list again.
  useEffect(() => {
    const replies = chat.messages.filter((m) => m.role === 'assistant').length;
    if (replies > answered.current) {
      answered.current = replies;
      loadCases();
    }
  }, [chat.messages]);

  function ask() {
    const text = input.trim();
    if (!text || chat.busy) return;
    setInput('');
    void chat.send(text);
  }

  return (
    <ProfileFrame title={copy.title} backHref="/profile">
      <p className="text-[15px] leading-relaxed text-[var(--ink-secondary)]">{copy.intro}</p>

      <section className={`${CARD_CLASS} space-y-3 p-4`}>
        {chat.messages.length > 0 && (
          <div className="max-h-[50vh] space-y-3 overflow-y-auto">
            <AssistantThread messages={chat.messages} busy={chat.busy} onNavigate={() => undefined} />
          </div>
        )}
        {chat.error && <p role="alert" className="text-[14px] text-[var(--ink-secondary)]">{chat.error}</p>}
        <label htmlFor="help-ask" className="block text-[14px] font-semibold text-[var(--ink)]">{copy.askLabel}</label>
        <div className="flex items-end gap-2">
          <textarea
            id="help-ask"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                ask();
              }
            }}
            rows={2}
            placeholder={copy.askPlaceholder}
            className="min-h-12 flex-1 resize-y rounded-[12px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--ink-secondary)]"
          />
          <button type="button" onClick={ask} disabled={chat.busy || !input.trim()} className={buttonClasses({ variant: 'primary', size: 'md' })}>
            {copy.send}
          </button>
        </div>
        <p className="text-[13px] text-[var(--ink-secondary)]">{copy.hours}</p>
      </section>

      <section aria-labelledby="your-cases">
        <h2 id="your-cases" className="mb-2 px-1 text-[15px] font-semibold text-[var(--ink)]">{copy.yourCases}</h2>
        {cases === null ? (
          <div aria-hidden className={`${CARD_CLASS} h-20 animate-pulse`} />
        ) : cases.length === 0 ? (
          <p className="px-1 text-[14px] text-[var(--ink-secondary)]">{copy.noCases}</p>
        ) : (
          <ul data-cases className={`${CARD_CLASS} divide-y divide-[var(--line)]`}>
            {cases.map((c) => (
              <li key={c.ref}>
                <Link href={`/profile/help/${encodeURIComponent(c.ref)}`} className="flex min-h-16 items-center justify-between gap-4 px-4 py-3 hover:bg-[var(--raised)]">
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold text-[var(--ink)]">{caseTitle(c.ref, copy)} · {copy.kinds[c.kind]}</span>
                    <span className="block truncate text-[14px] text-[var(--ink-secondary)]">{c.lastLine}</span>
                  </span>
                  <span className="shrink-0 text-end text-[13px] text-[var(--ink-secondary)]">
                    {stateWords(c.state, copy)}
                    <span className="block">{relativeTime(c.updatedAt, locale)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </ProfileFrame>
  );
}
