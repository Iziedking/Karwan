'use client';

import { useEffect, useState } from 'react';
import { api, ApiError, type AgentReleaseView } from '@/core/api';
import { ConfirmSheet } from '@/features/deals/workspace/ConfirmSheet';
import { fill } from '@/features/deals/workspace/presentation';
import { localDay } from '@/features/work/workModel';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { ALERT, FIELD, PRIMARY, SECONDARY } from '@/shared/ui/controls';
import { usePersonSession } from './usePersonSession';

/// The person's answer to delivered work (view 15). The agent sends the link;
/// the answer is proved with the World ID they paired with, so the agent can
/// never pay the seller on its own.
export function ReleasePage({ token }: { token: string }) {
  const t = useTranslations().agentJobs;
  const { locale } = useLocale();
  const [view, setView] = useState<AgentReleaseView | null>(null);
  const [gone, setGone] = useState(false);
  const [choice, setChoice] = useState<'happy' | 'unhappy' | null>(null);
  const [writing, setWriting] = useState(false);
  const [note, setNote] = useState('');
  const [result, setResult] = useState<'paid' | 'rejected' | null>(null);

  useEffect(() => {
    api.agentRelease(token).then(setView).catch((err) => setGone(err instanceof ApiError));
  }, [token]);

  const check = usePersonSession({
    copy: t.errors,
    request: () => api.agentReleaseRequest(token),
    verify: async (proof) => {
      const happy = choice === 'happy';
      await api.agentReleaseAnswer(token, proof, happy, happy ? undefined : note.trim());
      setResult(happy ? 'paid' : 'rejected');
      setChoice(null);
    },
  });

  if (gone) {
    return (
      <div className="mx-auto w-full max-w-[720px] px-4 py-12">
        <p className="text-[16px] text-[var(--ink-secondary)]">{t.errors.used}</p>
      </div>
    );
  }
  if (!view) return null;

  const amount = fill(t.release.happy, { amount: view.amountUsdc });
  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-12 sm:py-16">
      <h1 className="text-[28px] font-semibold leading-tight text-[var(--lp-ink)]">{t.release.title}</h1>
      <p className="mt-6 text-[40px] font-semibold tabular-nums leading-none text-[var(--lp-ink)]">{view.amountUsdc} USDC</p>
      <dl className="mt-6 divide-y divide-[var(--lp-line)] border-y border-[var(--lp-line)] text-[15px]">
        <div className="flex justify-between gap-4 py-3"><dt className="text-[var(--ink-secondary)]">{t.release.from}</dt><dd className="text-[var(--lp-ink)]">{view.seller}</dd></div>
        <div className="py-3"><dt className="text-[var(--ink-secondary)]">{view.work}</dt></div>
        {view.deliveryNote ? (
          <div className="py-3">
            <dt className="text-[var(--ink-secondary)]">{t.release.delivered}</dt>
            <dd className="mt-1 whitespace-pre-line text-[var(--lp-ink)]">{view.deliveryNote}</dd>
          </div>
        ) : null}
      </dl>

      {result ? (
        <p role="status" className="mt-8 text-[17px] font-semibold text-[var(--lp-ink)]">{result === 'paid' ? t.release.paid : t.release.rejected}</p>
      ) : writing ? (
        <div className="mt-8">
          <label htmlFor="unhappy" className="text-[15px] font-semibold text-[var(--lp-ink)]">{t.release.noteLabel}</label>
          <input id="unhappy" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} className={`mt-2 ${FIELD}`} aria-describedby="unhappy-hint" />
          <p id="unhappy-hint" className="mt-1 text-[14px] text-[var(--ink-secondary)]">{t.release.noteHint}</p>
          <button type="button" disabled={!note.trim()} onClick={() => setChoice('unhappy')} className={`mt-5 ${PRIMARY}`}>{t.release.sendNotHappy}</button>
        </div>
      ) : (
        <div className="mt-8 flex flex-wrap gap-3">
          <button type="button" onClick={() => setChoice('happy')} className={PRIMARY}>{amount}</button>
          <button type="button" onClick={() => setWriting(true)} className={SECONDARY}>{t.release.notHappy}</button>
        </div>
      )}
      {!result && view.reviewEnds ? (
        <p className="mt-6 text-[14px] text-[var(--ink-secondary)]">{fill(t.release.reviewEnds, { date: localDay(view.reviewEnds, locale) })}</p>
      ) : null}
      {check.error && !choice ? <p role="alert" className={`mt-4 ${ALERT}`}>{check.error}</p> : null}

      <ConfirmSheet
        open={choice !== null}
        title={choice === 'happy' ? amount : t.release.sendNotHappy}
        consequence={choice === 'happy' ? fill(t.release.payConsequence, { amount: view.amountUsdc }) : t.release.notHappyConsequence}
        irreversible={choice === 'happy'}
        confirmLabel={choice === 'happy' ? amount : t.release.sendNotHappy}
        busy={check.phase !== 'idle'}
        error={check.error}
        onConfirm={() => void check.begin()}
        onClose={() => {
          if (check.phase === 'idle') setChoice(null);
        }}
      >
        {null}
      </ConfirmSheet>
      {check.widget}
    </div>
  );
}
