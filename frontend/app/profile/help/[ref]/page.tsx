'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, type MyCase, type MyCaseMessage } from '@/core/api';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { buttonClasses } from '@/shared/components/Button';
import { CARD_CLASS } from '@/shared/components/Card';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { ProfileFrame } from '@/features/profile/ui/ProfileUi';
import { caseTitle, stateWords, whoWords } from '@/features/support/casePresentation';

/// One of the person's cases (view 78): the whole conversation with the help
/// bot and the team, and a box to write more. Replies also arrive on Telegram
/// or by email; this page always has them.

const POLL_MS = 8000;

export default function CasePage() {
  const t = useTranslations();
  return (
    <AuthGuard gateTag={t.profile.signInGate.tag} gateBody={t.profile.signInGate.body}>
      <CaseView />
    </AuthGuard>
  );
}

function CaseView() {
  const copy = useTranslations().supportPage;
  const { locale } = useLocale();
  const ref = decodeURIComponent(String(useParams<{ ref: string }>().ref ?? ''));
  const [data, setData] = useState<{ case: MyCase; messages: MyCaseMessage[] } | null>(null);
  const [missing, setMissing] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .myCase(ref)
      .then((r) => setData((prev) => (JSON.stringify(prev) === JSON.stringify(r) ? prev : r)))
      .catch(() => setMissing(true));
  }, [ref]);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  async function send() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await api.writeToCase(ref, body);
      setText('');
      load();
    } catch {
      setErr(copy.failed);
    } finally {
      setBusy(false);
    }
  }

  const time = (at: number) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(at);

  return (
    <ProfileFrame title={caseTitle(ref, copy)} backHref="/profile/help">
      {missing && !data ? (
        <p className="text-[15px] text-[var(--ink-secondary)]">{copy.notFound}</p>
      ) : !data ? (
        <div aria-hidden className={`${CARD_CLASS} h-40 animate-pulse`} />
      ) : (
        <>
          <p className="text-[15px] text-[var(--ink-secondary)]">
            {copy.kinds[data.case.kind]} · {stateWords(data.case.state, copy)}
          </p>
          <ol data-case-messages className="space-y-3">
            {data.messages.map((m, i) => {
              const mine = m.role === 'person';
              return (
                <li key={`${m.at}-${i}`} className={mine ? 'flex justify-end' : 'flex justify-start'}>
                  <div className={`max-w-[85%] rounded-[16px] px-4 py-3 text-[15px] leading-relaxed ${mine ? 'bg-[var(--raised)] text-[var(--ink)]' : `${CARD_CLASS} text-[var(--ink)]`}`}>
                    <p className="mb-1 text-[13px] text-[var(--ink-secondary)]">{whoWords(m.role, copy)} · {time(m.at)}</p>
                    <p className="whitespace-pre-wrap break-words">{m.text}</p>
                  </div>
                </li>
              );
            })}
          </ol>
          <div className={`${CARD_CLASS} space-y-2 p-4`}>
            <label htmlFor="case-write" className="block text-[14px] font-semibold text-[var(--ink)]">{copy.writeLabel}</label>
            <textarea
              id="case-write"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder={copy.writePlaceholder}
              className="w-full resize-y rounded-[12px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--ink-secondary)]"
            />
            {err && <p role="alert" className="text-[14px] text-[var(--ink-secondary)]">{err}</p>}
            <button type="button" onClick={() => void send()} disabled={busy || !text.trim()} className={`w-full ${buttonClasses({ variant: 'primary', size: 'lg' })}`}>
              {copy.send}
            </button>
            <p className="text-[13px] text-[var(--ink-secondary)]">{copy.hours}</p>
          </div>
        </>
      )}
    </ProfileFrame>
  );
}
