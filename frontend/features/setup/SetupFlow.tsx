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
import { PRIMARY } from '@/shared/ui/controls';
import { ChoiceCard, SummaryLines } from './SetupParts';
import { Nudge, StartBar } from './StartParts';
import { answersFromProfile, initialSetup, setupReducer } from './setupMachine';
import { TEXT_STEPS, aboutProgress, asksClients, isQuestionStep, sells, setupSteps, type Goal, type TextStep } from './setupSteps';

const GOALS: Goal[] = ['work', 'sell', 'buy', 'business', 'record'];
/// The reading never flashes: it shows for at least this long.
const MIN_READING_MS = 600;
/// The agent reads the work back once the person stops typing for this long.
const READ_BACK_MS = 900;

/// The setup conversation. On /start it is "About you", the last of the three
/// parts of sign-up (view 39); under Profile it is where the answers change.
export function SetupFlow({ embedded = false }: { embedded?: boolean }) {
  const t = useTranslations().profile.signInGate;
  return (
    <AuthGuard gateTag={t.tag} gateBody={t.body}>
      <SetupConversation embedded={embedded} />
    </AuthGuard>
  );
}

function SetupConversation({ embedded }: { embedded: boolean }) {
  const messages = useTranslations();
  const t = messages.setup;
  const f = messages.startFlow.about;
  const { locale } = useLocale();
  const router = useRouter();
  const reduce = useHydratedReducedMotion();
  const { profile, refresh } = useUserProfile();
  const [state, dispatch] = useReducer(setupReducer, undefined, initialSetup);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [postNow, setPostNow] = useState(true);
  const [readBack, setReadBack] = useState<{ lines: string[]; noPrice: boolean } | 'reading' | null>(null);
  const { answers, step } = state;
  const steps = setupSteps(answers.goals);
  const asking = isQuestionStep(step);
  const rtl = locale === 'ar';
  const offset = (reduce ? 0 : 24) * state.direction * (rtl ? -1 : 1);
  const tag = profile?.handle ? `@${profile.handle}` : '';
  const sellOnly = answers.goals.includes('sell') && !answers.goals.includes('work');

  // "Change" under Me opens here with the saved answers, on the summary.
  useEffect(() => {
    if (typeof window === 'undefined' || !profile) return;
    if (new URLSearchParams(window.location.search).get('edit') !== '1') return;
    const saved = answersFromProfile(profile);
    let live = true;
    api.setupPreview(saved).then((r) => { if (live) dispatch({ type: 'resume', answers: saved, lines: r.lines }); }).catch(() => {});
    return () => { live = false; };
  }, [profile]);

  // Reading: the server reads the answers, at least long enough to be seen.
  useEffect(() => {
    if (step !== 'reading') return;
    let live = true;
    setError(null);
    Promise.all([api.setupPreview(answers), new Promise((r) => setTimeout(r, MIN_READING_MS))])
      .then(([r]) => { if (live) dispatch({ type: 'read', lines: r.lines, needs: r.needs }); })
      .catch(() => { if (live) { setError(t.saveError); dispatch({ type: 'back' }); } });
    return () => { live = false; };
  }, [step, answers, t.saveError]);

  // On the work question the agent says back what it understood, so a wrong
  // price is caught before the summary.
  const what = answers.what?.trim() ?? '';
  const price = answers.price?.trim() ?? '';
  useEffect(() => {
    if (step !== 'work' || what.length < 2 || price.length < 2) {
      setReadBack(null);
      return;
    }
    let live = true;
    const id = window.setTimeout(() => {
      setReadBack('reading');
      api.setupPreview({ goals: answers.goals, what, price, retried: true })
        .then((r) => { if (live) setReadBack({ lines: r.lines.slice(0, 2), noPrice: r.needs.includes('price') }); })
        .catch(() => { if (live) setReadBack(null); });
    }, READ_BACK_MS);
    return () => { live = false; window.clearTimeout(id); };
  }, [step, what, price, answers.goals]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const saved = await api.setupSave(answers);
      refresh();
      if (postNow && saved.firstPost) openHelp(saved.firstPost.handOff, { send: true });
      router.push('/app');
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) dispatch({ type: 'read', lines: state.lines, needs: ['price'] });
      else setError(t.saveError);
      setSaving(false);
    }
  }

  const text = (TEXT_STEPS as readonly string[]).includes(step) ? (step as TextStep) : null;
  const choice = step === 'paid' || step === 'own' ? step : null;
  const backable = asking && (step !== 'goals' || state.fromSummary);
  const firstPostKind = sells(answers.goals) ? 'offer' : answers.goals.includes('buy') ? 'request' : null;

  const choiceLabel = (key: 'clients' | 'own' | 'reach' | 'paid', value: string | undefined) => {
    if (!value) return null;
    if (key === 'clients') return messages.startFlow.about.summary.clients[value as 'own' | 'find' | 'both'];
    const options = t.choices[key].options as Record<string, { label: string }>;
    return options[value]?.label ?? null;
  };

  return (
    <div className="min-h-[calc(100svh-var(--lp-nav-h,68px))] text-[var(--lp-dark)]">
      <div className="mx-auto flex min-h-11 max-w-[560px] items-center gap-3 px-5 pt-4">
        {backable ? (
          <button type="button" onClick={() => dispatch({ type: 'back' })} aria-label={t.buttons.back} className="-ms-2.5 grid size-11 shrink-0 place-items-center rounded-full text-[var(--lp-dark)] hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="rtl:-scale-x-100"><path d="M19 12H5m6-6-6 6 6 6" /></svg>
          </button>
        ) : null}
        {embedded ? <StartBar part={step === 'summary' ? 3 : 2} fill={aboutProgress(steps, step)} /> : <span className="flex-1 text-[14px] font-medium text-[var(--lp-text-sub)]">{t.progressLabel}</span>}
        {step !== 'summary' ? (
          <Link href="/app" className="inline-flex min-h-11 shrink-0 items-center px-1 text-[14px] font-medium text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)]">{t.later}</Link>
        ) : null}
      </div>

      {/* The layout already holds the page's main landmark. */}
      <div className="mx-auto max-w-[560px] px-5 pb-16 pt-6">
        {/* The next question shows at once and slides in; the old one is not
            waited out, so the screen never goes blank between questions. */}
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.section
            key={step}
            initial={{ opacity: 0, x: offset }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, transition: { duration: 0 } }}
            transition={{ duration: reduce ? 0 : 0.18, ease: ease.out }}
          >
            {step === 'goals' ? (
              <div>
                {tag && !state.fromSummary ? <Nudge from="agent">{f.hello.replace('@{tag}', tag)}</Nudge> : null}
                <h1 id="setup-q-goals" className="mt-6 text-[28px] font-bold leading-tight tracking-[-0.03em]">{t.goals.title}</h1>
                <p className="mt-2 text-[16px] font-medium text-[var(--lp-text-sub)]">{f.goalsHelp}</p>
                <div role="group" aria-labelledby="setup-q-goals" className="mt-5 flex flex-col gap-2.5">
                  {GOALS.map((goal) => (
                    <ChoiceCard key={goal} multi reduce={reduce} label={t.goals.options[goal].label} note={t.goals.options[goal].note} on={answers.goals.includes(goal)} onPick={() => dispatch({ type: 'toggleGoal', goal })} />
                  ))}
                </div>
              </div>
            ) : null}

            {step === 'work' ? (
              <div>
                <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">{sellOnly ? f.work.titleSell : f.work.title}</h1>
                <Field
                  id="setup-what"
                  label={sellOnly ? f.work.whatLabelSell : f.work.whatLabel}
                  value={answers.what ?? ''}
                  placeholder={sellOnly ? t.questions.what.exampleSell : t.questions.what.example}
                  examples={sellOnly ? t.questions.what.examplesSell : t.questions.what.examples}
                  onChange={(value) => dispatch({ type: 'answer', step: 'what', value })}
                />
                <Field
                  id="setup-price"
                  label={f.work.priceLabel}
                  value={answers.price ?? ''}
                  placeholder={t.questions.price.example}
                  examples={t.questions.price.examples}
                  onChange={(value) => dispatch({ type: 'answer', step: 'price', value })}
                />
                <div className="mt-6">
                  <Nudge from="agent" live>
                    {readBack === null ? (answers.retried ? f.work.noPrice : f.work.waiting) : readBack === 'reading' ? f.work.reading : readBack.noPrice ? f.work.noPrice : (
                      <>
                        <p>{f.work.read}</p>
                        <ul className="mt-2 space-y-1 font-semibold">
                          {readBack.lines.map((line) => <li key={line} dir="auto">{line}</li>)}
                        </ul>
                        <p className="mt-2 text-[14px] text-[var(--lp-text-sub)]">{f.work.again}</p>
                      </>
                    )}
                  </Nudge>
                </div>
              </div>
            ) : null}

            {text ? (
              <div>
                <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">{t.questions[text].title}</h1>
                <p className="mt-2 text-[16px] font-medium text-[var(--lp-text-sub)]">{t.questions[text].help}</p>
                <Field
                  id={`setup-${text}`}
                  label={t.questions[text].title}
                  hideLabel
                  value={answers[text] ?? ''}
                  placeholder={t.questions[text].example}
                  examples={t.questions[text].examples}
                  onChange={(value) => dispatch({ type: 'answer', step: text, value })}
                />
                <div className="mt-6"><Nudge from="agent">{f.nudges[text]}</Nudge></div>
              </div>
            ) : null}

            {step === 'contact' ? (
              <div>
                {asksClients(answers.goals) ? (
                  <>
                    <h1 id="setup-q-clients" className="text-[28px] font-bold leading-tight tracking-[-0.03em]">{f.contact.title}</h1>
                    <div role="radiogroup" aria-labelledby="setup-q-clients" className="mt-5 flex flex-col gap-2.5">
                      {(['own', 'find', 'both'] as const).map((value) => (
                        <ChoiceCard key={value} multi={false} reduce={reduce} label={t.choices.clients.options[value].label} note={t.choices.clients.options[value].note} on={answers.clients === value} onPick={() => dispatch({ type: 'pick', step: 'clients', value })} />
                      ))}
                    </div>
                    {answers.clients ? <div className="mt-4"><Nudge from="agent" live>{f.contact.clients[answers.clients]}</Nudge></div> : null}
                  </>
                ) : null}
                {asksClients(answers.goals)
                  ? <h2 id="setup-q-reach" className="mt-8 text-[20px] font-bold">{f.contact.reachTitle}</h2>
                  : <h1 id="setup-q-reach" className="text-[28px] font-bold leading-tight tracking-[-0.03em]">{f.contact.reachTitle}</h1>}
                <div role="radiogroup" aria-labelledby="setup-q-reach" className="mt-4 grid grid-cols-3 gap-2">
                  {(['telegram', 'email', 'both'] as const).map((value) => {
                    const on = answers.reach === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => dispatch({ type: 'pick', step: 'reach', value })}
                        className={`min-h-[52px] rounded-[16px] border px-2 text-[15px] font-semibold transition-colors duration-[180ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${on ? 'border-[var(--lp-accent)] bg-[var(--offer-surface)]' : 'border-[var(--lp-outline-strong)] bg-[var(--lp-card)] hover:bg-[var(--lp-light)]'}`}
                      >
                        {t.choices.reach.options[value].label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2.5 text-[14px] font-medium text-[var(--lp-text-sub)]">{f.contact.reachHelp}</p>
                {answers.reach ? <div className="mt-4"><Nudge from="agent" live>{f.contact.reach[answers.reach]}</Nudge></div> : null}
              </div>
            ) : null}

            {choice ? (
              <div>
                <h1 id={`setup-q-${choice}`} className="text-[28px] font-bold leading-tight tracking-[-0.03em]">{t.choices[choice].title}</h1>
                <p className="mt-2 text-[16px] font-medium text-[var(--lp-text-sub)]">{t.choices[choice].help}</p>
                <div role="radiogroup" aria-labelledby={`setup-q-${choice}`} className="mt-5 flex flex-col gap-2.5">
                  {(Object.entries(t.choices[choice].options) as Array<[string, { label: string; note: string }]>).map(([value, option]) => (
                    <ChoiceCard key={value} multi={false} reduce={reduce} label={option.label} note={option.note} on={answers[choice] === value} onPick={() => dispatch({ type: 'pick', step: choice, value })} />
                  ))}
                </div>
              </div>
            ) : null}

            {step === 'reading' ? (
              <div role="status" className="pt-16 text-center">
                <p className="text-[20px] font-semibold">{t.reading.title}</p>
                <p className="mt-2 text-[15px] font-medium text-[var(--lp-text-sub)]">{t.reading.body}</p>
              </div>
            ) : null}

            {step === 'summary' ? (
              <div>
                <h1 className="text-[28px] font-bold tracking-[-0.03em]">{f.summary.title}</h1>
                <dl className="mt-5 border-t border-[var(--lp-border-light)]">
                  {tag ? <SummaryRow label={f.summary.rows.tag} value={tag} /> : null}
                  {asksClients(answers.goals) && answers.clients ? <SummaryRow label={f.summary.rows.clients} value={choiceLabel('clients', answers.clients)} change={f.summary.change} onChange={() => dispatch({ type: 'goto', step: 'contact' })} /> : null}
                  {sells(answers.goals) ? <SummaryRow label={f.summary.rows.paid} value={choiceLabel('paid', answers.paid)} change={f.summary.change} onChange={() => dispatch({ type: 'goto', step: 'paid' })} /> : null}
                  <SummaryRow label={f.summary.rows.agent} value={choiceLabel('own', answers.own)} change={f.summary.change} onChange={() => dispatch({ type: 'goto', step: 'own' })} />
                  {answers.reach ? <SummaryRow label={f.summary.rows.reach} value={choiceLabel('reach', answers.reach)} change={f.summary.change} onChange={() => dispatch({ type: 'goto', step: 'contact' })} /> : null}
                </dl>

                {state.lines.length > 0 ? (
                  <section aria-labelledby="setup-first-post" className="mt-6 rounded-[22px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-5">
                    <h2 id="setup-first-post" className="text-[14px] font-semibold text-[var(--lp-text-sub)]">{firstPostKind === 'request' ? f.summary.firstRequest : f.summary.firstOffer}</h2>
                    <SummaryLines lines={state.lines} reduce={reduce} />
                    {firstPostKind ? (
                      <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 text-[15px] font-semibold">
                        <input type="checkbox" checked={postNow} onChange={(e) => setPostNow(e.target.checked)} className="size-5 shrink-0 accent-[var(--lp-accent)]" />
                        {f.summary.postNow}
                      </label>
                    ) : null}
                  </section>
                ) : null}

                <div className="mt-5"><Nudge from="agent">{f.summary.body}</Nudge></div>
                <button type="button" onClick={() => void save()} disabled={saving} aria-busy={saving} className={`${PRIMARY} mt-6 w-full`}>{saving ? f.summary.saving : f.summary.done}</button>
                <button type="button" onClick={() => dispatch({ type: 'edit' })} disabled={saving} className="mt-2 inline-flex min-h-11 w-full items-center justify-center text-[15px] font-medium text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)]">{t.summary.change}</button>
              </div>
            ) : null}
          </motion.section>
        </AnimatePresence>

        {error ? <p role="alert" className="mt-4 border-s-2 border-[var(--color-critical)] ps-3 text-[14px]">{error}</p> : null}

        {asking ? (
          <button type="button" onClick={() => dispatch({ type: 'next' })} className={`${PRIMARY} mt-8 w-full`}>{t.buttons.next}</button>
        ) : null}
      </div>
    </div>
  );
}

/// A line answered in the person's own words, with examples to tap.
function Field({ id, label, hideLabel = false, value, placeholder, examples, onChange }: {
  id: string;
  label: string;
  hideLabel?: boolean;
  value: string;
  placeholder: string;
  examples: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="mt-5">
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'block text-[15px] font-semibold text-[var(--lp-dark)]'}>{label}</label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        dir="auto"
        className="mt-2 block min-h-14 w-full rounded-[14px] border border-[var(--lp-outline-strong)] bg-[var(--lp-card)] px-[18px] text-[17px] text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      />
      <div className="mt-2.5 flex flex-wrap gap-2">
        {examples.map((x) => (
          <button key={x} type="button" onClick={() => onChange(x)} className="min-h-11 rounded-full border border-[var(--lp-outline-strong)] px-3.5 text-[14px] font-medium text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
            {x}
          </button>
        ))}
      </div>
    </div>
  );
}

function SummaryRow({ label, value, change, onChange }: { label: string; value: string | null; change?: string; onChange?: () => void }) {
  return (
    <div className="flex min-h-14 items-center gap-3 border-b border-[var(--lp-border-light)] py-2">
      <dt className="w-28 shrink-0 text-[14px] font-medium text-[var(--lp-text-sub)]">{label}</dt>
      <dd className="flex min-w-0 flex-1 items-center gap-3">
        <span dir="auto" className="min-w-0 flex-1 text-[15px] font-semibold">{value}</span>
        {change && onChange ? (
          <button type="button" onClick={onChange} className="inline-flex min-h-11 shrink-0 items-center px-1 text-[14px] font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
            {change}
            <span className="sr-only"> {label}</span>
          </button>
        ) : null}
      </dd>
    </div>
  );
}
