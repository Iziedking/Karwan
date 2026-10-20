'use client';

import { useEffect, useReducer, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { api, ApiError } from '@/core/api';
import { openHelp } from '@/shared/assistant/openHelp';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { useHydratedReducedMotion } from '@/shared/hooks/useHydratedReducedMotion';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { ease } from '@/shared/motion/tokens';
import { PRIMARY, SECONDARY } from '@/shared/ui/controls';
import { ChoiceCard, SummaryLines, TextQuestion } from './SetupParts';
import { answersFromProfile, initialSetup, setupReducer } from './setupMachine';
import { CHOICE_STEPS, TEXT_STEPS, questionProgress, setupSteps, type Goal, type TextStep } from './setupSteps';

const GOALS: Goal[] = ['work', 'sell', 'buy', 'business', 'record'];
/// The reading never flashes: it shows for at least this long.
const MIN_READING_MS = 600;

export function SetupFlow() {
  const t = useTranslations().profile.signInGate;
  return (
    <AuthGuard gateTag={t.tag} gateBody={t.body}>
      <SetupConversation />
    </AuthGuard>
  );
}

function SetupConversation() {
  const t = useTranslations().setup;
  const { locale } = useLocale();
  const router = useRouter();
  const reduce = useHydratedReducedMotion();
  const { profile, refresh } = useUserProfile();
  const [state, dispatch] = useReducer(setupReducer, undefined, initialSetup);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const steps = setupSteps(state.answers.goals);
  const progress = questionProgress(steps, state.step);
  const rtl = locale === 'ar';
  const offset = (reduce ? 0 : 24) * state.direction * (rtl ? -1 : 1);

  // "Change" under Me opens here with the saved answers, on the summary.
  useEffect(() => {
    if (typeof window === 'undefined' || !profile) return;
    if (new URLSearchParams(window.location.search).get('edit') !== '1') return;
    const answers = answersFromProfile(profile);
    let live = true;
    api.setupPreview(answers).then((r) => { if (live) dispatch({ type: 'resume', answers, lines: r.lines }); }).catch(() => {});
    return () => { live = false; };
  }, [profile]);

  // Reading: the server reads the answers, at least long enough to be seen.
  useEffect(() => {
    if (state.step !== 'reading') return;
    let live = true;
    setError(null);
    Promise.all([api.setupPreview(state.answers), new Promise((r) => setTimeout(r, MIN_READING_MS))])
      .then(([r]) => { if (live) dispatch({ type: 'read', lines: r.lines, needs: r.needs }); })
      .catch(() => { if (live) { setError(t.saveError); dispatch({ type: 'back' }); } });
    return () => { live = false; };
  }, [state.step, state.answers, t.saveError]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.setupSave(state.answers);
      refresh();
      router.push('/app');
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) dispatch({ type: 'read', lines: state.lines, needs: ['price'] });
      else setError(t.saveError);
    } finally {
      setSaving(false);
    }
  }

  const text = (TEXT_STEPS as readonly string[]).includes(state.step) ? (state.step as TextStep) : null;
  const choice = (CHOICE_STEPS as readonly string[]).includes(state.step) ? (state.step as (typeof CHOICE_STEPS)[number]) : null;
  const sellOnly = state.answers.goals.includes('sell') && !state.answers.goals.includes('work');

  return (
    <div className="min-h-[calc(100svh-var(--lp-nav-h,68px))] text-[var(--lp-dark)]">
      <div className="mx-auto flex max-w-[640px] items-center justify-between px-6 pt-4">
        {progress ? (
          <span className="text-[14px] font-medium text-[var(--lp-text-sub)]">{t.progressLabel}</span>
        ) : <span />}
        {state.step !== 'summary' ? (
          <Link href="/app" className="inline-flex min-h-11 items-center px-2 text-[15px] font-medium text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)]">{t.later}</Link>
        ) : null}
      </div>
      {progress ? (
        <div className="mx-auto max-w-[640px] px-6">
          <div className="flex justify-end text-[14px] font-medium tabular-nums text-[var(--lp-text-sub)]">
            {t.progress.replace('{index}', String(progress.index)).replace('{total}', String(progress.total))}
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--lp-light)]">
            <motion.div
              className="h-1 rounded-full bg-[var(--lp-accent)]"
              initial={false}
              animate={{ width: `${Math.round((progress.index / progress.total) * 100)}%` }}
              transition={{ duration: reduce ? 0 : 0.24, ease: ease.out }}
            />
          </div>
        </div>
      ) : null}

      <main className="mx-auto max-w-[640px] px-6 pb-16 pt-10">
        <AnimatePresence mode="wait" initial={false}>
          <motion.section
            key={state.step}
            initial={{ opacity: 0, x: offset }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -offset }}
            transition={{ duration: reduce ? 0.12 : 0.26, ease: ease.out }}
          >
            {state.step === 'welcome' ? (
              <div className="pt-10 text-center">
                <span className="inline-grid size-[72px] place-items-center rounded-full border border-[var(--lp-accent)] bg-[var(--offer-surface)]">
                  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <motion.path d="M5 12.5 10 17.5 19 7" stroke="var(--lp-accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.42, delay: 0.12, ease: ease.out }} />
                  </svg>
                </span>
                <h1 className="mt-6 text-[34px] font-bold tracking-[-0.03em]">{t.welcome.title}</h1>
                <p className="mx-auto mt-3 max-w-[46ch] text-[17px] font-medium leading-relaxed text-[var(--lp-text-sub)]">{t.welcome.body}</p>
                <button type="button" onClick={() => dispatch({ type: 'start' })} className={`${PRIMARY} mt-8`}>{t.welcome.start}</button>
              </div>
            ) : null}

            {state.step === 'goals' ? (
              <div>
                <h1 className="text-[30px] font-bold leading-tight tracking-[-0.03em]">{t.goals.title}</h1>
                <p className="mt-2 text-[16px] font-medium text-[var(--lp-text-sub)]">{t.goals.help}</p>
                <div className="mt-6 flex flex-col gap-2.5">
                  {GOALS.map((goal) => (
                    <ChoiceCard key={goal} multi reduce={reduce} label={t.goals.options[goal].label} note={t.goals.options[goal].note} on={state.answers.goals.includes(goal)} onPick={() => dispatch({ type: 'toggleGoal', goal })} />
                  ))}
                </div>
              </div>
            ) : null}

            {text ? (
              <>
                <TextQuestion
                  id={`setup-${text}`}
                  label={text === 'what' && sellOnly ? t.questions.what.titleSell : text === 'price' && state.answers.retried ? t.priceAgain : t.questions[text].title}
                  help={t.questions[text].help}
                  example={text === 'what' && sellOnly ? t.questions.what.exampleSell : t.questions[text].example}
                  examples={text === 'what' && sellOnly ? t.questions.what.examplesSell : t.questions[text].examples}
                  value={state.answers[text] ?? ''}
                  onChange={(value) => dispatch({ type: 'answer', step: text, value })}
                />
                <button type="button" onClick={() => openHelp()} className="mt-7 inline-flex min-h-11 items-center gap-2.5 text-[15px] font-medium text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)]">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--lp-accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 5h16v11H9l-5 4z" /></svg>
                  {t.ask}
                </button>
              </>
            ) : null}

            {choice ? (
              <div>
                <h1 className="text-[30px] font-bold leading-tight tracking-[-0.03em]">{t.choices[choice].title}</h1>
                <p className="mt-2 text-[16px] font-medium text-[var(--lp-text-sub)]">{t.choices[choice].help}</p>
                <div className="mt-6 flex flex-col gap-2.5">
                  {(Object.entries(t.choices[choice].options) as Array<[string, { label: string; note: string }]>).map(([value, option]) => (
                    <ChoiceCard key={value} multi={false} reduce={reduce} label={option.label} note={option.note} on={state.answers[choice] === value} onPick={() => dispatch({ type: 'pick', step: choice, value })} />
                  ))}
                </div>
              </div>
            ) : null}

            {state.step === 'reading' ? (
              <div role="status" className="pt-20 text-center">
                <p className="text-[20px] font-semibold">{t.reading.title}</p>
                <p className="mt-2 text-[15px] font-medium text-[var(--lp-text-sub)]">{t.reading.body}</p>
              </div>
            ) : null}

            {state.step === 'summary' ? (
              <div>
                <h1 className="text-[30px] font-bold tracking-[-0.03em]">{t.summary.title}</h1>
                <p className="mt-2 text-[16px] font-medium text-[var(--lp-text-sub)]">{t.summary.body}</p>
                <SummaryLines lines={state.lines} reduce={reduce} />
                <div className="mt-6 flex flex-wrap justify-end gap-2.5">
                  <button type="button" onClick={() => dispatch({ type: 'edit' })} className={SECONDARY}>{t.summary.change}</button>
                  <button type="button" onClick={() => void save()} disabled={saving} className={PRIMARY}>{t.summary.looksRight}</button>
                </div>
              </div>
            ) : null}
          </motion.section>
        </AnimatePresence>

        {error ? <p role="alert" className="mt-4 border-s-2 border-[var(--color-critical)] ps-3 text-[14px]">{error}</p> : null}

        {progress ? (
          <div className="mt-8 flex justify-between gap-3">
            <button type="button" onClick={() => dispatch({ type: 'back' })} className="min-h-12 px-5 text-[16px] font-medium text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)]">{t.buttons.back}</button>
            <div className="flex gap-2">
              {state.step !== 'goals' ? (
                <button type="button" onClick={() => dispatch({ type: 'skip' })} className={SECONDARY}>{t.buttons.skip}</button>
              ) : null}
              <button type="button" onClick={() => dispatch({ type: 'next' })} className={PRIMARY}>{t.buttons.next}</button>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
