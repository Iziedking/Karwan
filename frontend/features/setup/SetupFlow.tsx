'use client';

import { useCallback, useEffect, useReducer, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, m } from 'motion/react';
import { api, ApiError, type SetupCard } from '@/core/api';
import { openHelp } from '@/shared/assistant/openHelp';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { AmanFace } from '@/shared/guide/AmanFace';
import { useHydratedReducedMotion } from '@/shared/hooks/useHydratedReducedMotion';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { ease } from '@/shared/motion/tokens';
import { deviceCountry } from '@/shared/places/guessCountry';
import { PRIMARY } from '@/shared/ui/controls';
import { safeNext } from '@/shared/auth/safeNext';
import { useDisplayCurrency } from '@/features/money/hooks/useDisplayCurrency';
import { useMoneyText } from '@/features/money/hooks/useMoneyText';
import { ChoiceCard } from './SetupParts';
import { localExample } from './setupMoney';
import { Nudge, StartBar } from './StartParts';
import { WhereStep } from './WhereStep';
import { answersFromProfile, initialSetup, setupReducer } from './setupMachine';
import { aboutProgress, buys, canGoOn, firstPostKind, isQuestionStep, sells, setupSteps, type Role } from './setupSteps';

const ROLES: Role[] = ['sell', 'buy', 'both'];
/// The reading never flashes: it shows for at least this long.
const MIN_READING_MS = 600;
/// The agent reads the line back once the person stops typing for this long.
const READ_BACK_MS = 900;

/// Setup. On /start it is "About you", the last of the three parts of sign-up
/// (view 39, "Set up in two minutes", 19 Nov); under Profile it is where the
/// answers change.
export function SetupFlow({ embedded = false, next = null }: { embedded?: boolean; next?: string | null }) {
  const t = useTranslations().profile.signInGate;
  return (
    <AuthGuard gateTag={t.tag} gateBody={t.body}>
      <SetupConversation embedded={embedded} next={next} />
    </AuthGuard>
  );
}

function SetupConversation({ embedded, next }: { embedded: boolean; next: string | null }) {
  const messages = useTranslations();
  const t = messages.setup;
  const q = t.quick;
  const rowChange = q.change;
  const { locale } = useLocale();
  const router = useRouter();
  const reduce = useHydratedReducedMotion();
  const { profile, refresh } = useUserProfile();
  const [state, dispatch] = useReducer(setupReducer, undefined, () => initialSetup(Date.now(), deviceCountry()));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const destination = safeNext(next);
  const [postNow, setPostNow] = useState(!destination);
  const [readBack, setReadBack] = useState<SetupCard | 'reading' | null>(null);
  const [card, setCard] = useState<SetupCard | null>(null);
  const { answers, step } = state;
  const steps = setupSteps();
  const asking = isQuestionStep(step);
  const rtl = locale === 'ar';
  const offset = (reduce ? 0 : 24) * state.direction * (rtl ? -1 : 1);
  const tag = profile?.handle ? `@${profile.handle}` : '';
  const { currency, rate } = useDisplayCurrency();
  const money = useMoneyText({ compact: true });
  const ex = (example: string) => localExample(example, currency, rate, locale);

  // The country picked under the tag is where setup starts.
  const savedCountry = profile?.location?.country ?? null;
  const placeCity = answers.place?.city;
  useEffect(() => {
    if (savedCountry && !placeCity) dispatch({ type: 'country', country: savedCountry });
  }, [savedCountry, placeCity]);

  // "Change" under Me opens here with the saved answers, on the summary.
  useEffect(() => {
    if (typeof window === 'undefined' || !profile) return;
    if (new URLSearchParams(window.location.search).get('edit') !== '1') return;
    const saved = answersFromProfile(profile);
    let live = true;
    api.setupPreview(saved).then((r) => {
      if (!live) return;
      setCard(r.card ?? null);
      dispatch({ type: 'resume', answers: saved, lines: r.lines });
    }).catch(() => {});
    return () => { live = false; };
  }, [profile]);

  // Reading: the server reads the answers, at least long enough to be seen.
  useEffect(() => {
    if (step !== 'reading') return;
    let live = true;
    setError(null);
    Promise.all([api.setupPreview(answers), new Promise((r) => setTimeout(r, MIN_READING_MS))])
      .then(([r]) => {
        if (!live) return;
        setCard(r.card ?? null);
        dispatch({ type: 'read', lines: r.lines, needs: r.needs });
      })
      .catch(() => { if (live) { setError(t.saveError); dispatch({ type: 'back' }); } });
    return () => { live = false; };
  }, [step, answers, t.saveError]);

  // The agent says back what it read from the sell line, so a wrong price is
  // caught before the summary.
  const sellLine = answers.sellLine?.trim() ?? '';
  const selling = sells(answers);
  useEffect(() => {
    if (step !== 'role' || !selling || sellLine.length < 2) {
      setReadBack(null);
      return;
    }
    let live = true;
    const id = window.setTimeout(() => {
      setReadBack('reading');
      api.setupPreview({ role: 'sell', sellLine, retried: true })
        .then((r) => { if (live) setReadBack(r.card ?? null); })
        .catch(() => { if (live) setReadBack(null); });
    }, READ_BACK_MS);
    return () => { live = false; window.clearTimeout(id); };
  }, [step, selling, sellLine]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const saved = await api.setupSave(answers);
      refresh();
      if (!destination && postNow && saved.firstPost) openHelp(saved.firstPost.handOff, { send: true });
      router.push(destination ?? '/app');
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) dispatch({ type: 'read', lines: state.lines, needs: ['price'] });
      else setError(t.saveError);
      setSaving(false);
    }
  }

  const onCountry = useCallback((country: string) => dispatch({ type: 'country', country }), []);
  const onPlace = useCallback((place: NonNullable<typeof answers.place>) => dispatch({ type: 'place', place }), []);
  const onReach = useCallback((reach: typeof answers.reach) => dispatch({ type: 'reach', reach }), []);

  const backable = asking && (step !== 'role' || state.fromSummary);
  const postKind = firstPostKind(answers);
  const readWhat = (typeof readBack === 'object' && readBack?.what) || card?.what || sellLine.split(',')[0] || answers.buyLine || '';
  const priceText = (c: SetupCard | null) =>
    !c || c.priceMin === null ? null : c.priceMax === null || c.priceMax === c.priceMin ? money.text(c.priceMin) : q.range.replace('{min}', money.text(c.priceMin)).replace('{max}', money.text(c.priceMax));
  const daysText = (c: SetupCard | null) =>
    !c || c.daysMax === null ? null : c.daysMax === 0 ? q.sameDay : q.days.replace('{n}', String(c.daysMax));
  const regionName = (code: string | undefined) => {
    if (!code) return '';
    try {
      return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
    } catch {
      return code;
    }
  };
  const reachText = answers.reach === 'both' ? q.reachBoth : answers.reach === 'telegram' ? 'Telegram' : answers.reach === 'email' ? t.choices.reach.options.email.label : '';
  const amanForRole = answers.role === 'sell' ? q.amanSell : answers.role === 'buy' ? q.amanBuy : answers.role === 'both' ? q.amanBoth : q.amanRole;

  return (
    <div className="min-h-[calc(100svh-68px)] text-[var(--ink)]">
      <div className="mx-auto flex min-h-11 max-w-[560px] items-center gap-3 px-5 pt-4">
        {backable ? (
          <button type="button" onClick={() => dispatch({ type: 'back' })} aria-label={t.buttons.back} className="-ms-2.5 grid size-11 shrink-0 place-items-center rounded-full text-[var(--ink)] hover:bg-[var(--raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="rtl:-scale-x-100"><path d="M19 12H5m6-6-6 6 6 6" /></svg>
          </button>
        ) : null}
        {embedded ? <StartBar part={step === 'summary' ? 3 : 2} fill={aboutProgress(steps, step)} /> : <span className="flex-1 text-[14px] font-medium text-[var(--ink-secondary)]">{t.progressLabel}</span>}
        {step !== 'summary' ? (
          <Link href={destination ?? '/app'} className="inline-flex min-h-11 shrink-0 items-center px-1 text-[14px] font-medium text-[var(--ink-secondary)] hover:text-[var(--ink)]">{t.later}</Link>
        ) : null}
      </div>

      {/* The layout already holds the page's main landmark. */}
      <div className="mx-auto max-w-[560px] px-5 pb-16 pt-6">
        <AnimatePresence mode="popLayout" initial={false}>
          <m.section
            key={step}
            initial={{ opacity: 0, x: offset }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, transition: { duration: 0 } }}
            transition={{ duration: reduce ? 0 : 0.18, ease: ease.out }}
          >
            {step === 'role' ? (
              <div>
                <h1 id="setup-q-role" className="text-[26px] font-semibold leading-tight tracking-[-0.03em]">{q.roleTitle}</h1>
                <div role="radiogroup" aria-labelledby="setup-q-role" className="mt-5 flex flex-col gap-2">
                  {ROLES.map((role) => (
                    <ChoiceCard key={role} multi={false} reduce={reduce} label={q.roles[role].label} note={q.roles[role].note} on={answers.role === role} onPick={() => dispatch({ type: 'role', role })} />
                  ))}
                </div>
                {selling ? (
                  <Line id="setup-sell" label={q.sellLabel} value={answers.sellLine ?? ''} placeholder={ex(q.sellExample)} examples={q.sellExamples.map(ex)} onChange={(value) => dispatch({ type: 'line', side: 'sell', value })} />
                ) : null}
                {selling && readBack ? (
                  <div className="mt-4">
                  <Nudge from="agent" live inline>
                    <p className="text-[14px] text-[var(--ink-secondary)]">{readBack === 'reading' ? q.reading : q.readAs}</p>
                    {readBack !== 'reading' ? (
                      readBack.priceMin === null ? (
                        <p className="mt-1.5 text-[14px] text-[var(--ink-secondary)]">{q.noPrice}</p>
                      ) : (
                        <ul className="mt-2 flex flex-wrap gap-1.5">
                          {[
                            readBack.what,
                            q.lowest.replace('{money}', money.text(readBack.priceMin)),
                            readBack.priceMax !== null ? q.usual.replace('{money}', money.text((readBack.priceMin + readBack.priceMax) / 2)) : null,
                            daysText(readBack),
                          ].filter((x): x is string => !!x).map((chip) => (
                            <li key={chip} dir="auto" className="rounded-[10px] border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 text-[14px] font-medium tabular-nums">{chip}</li>
                          ))}
                        </ul>
                      )
                    ) : null}
                  </Nudge>
                  </div>
                ) : null}
                {buys(answers) ? (
                  <Line id="setup-buy" label={q.buyLabel} value={answers.buyLine ?? ''} placeholder={ex(q.buyExample)} examples={q.buyExamples.map(ex)} onChange={(value) => dispatch({ type: 'line', side: 'buy', value })} />
                ) : null}
                <AmanLine>{answers.retried && selling && !(typeof readBack === 'object' && readBack?.priceMin) ? q.noPrice : amanForRole}</AmanLine>
              </div>
            ) : null}

            {step === 'where' ? (
              <div>
                <h1 className="mb-5 text-[26px] font-semibold leading-tight tracking-[-0.03em]">{q.whereTitle}</h1>
                <WhereStep answers={answers} what={readWhat} email={profile?.email ?? null} onCountry={onCountry} onPlace={onPlace} onReach={onReach} />
                <AmanLine>{q.amanWhere}</AmanLine>
              </div>
            ) : null}

            {step === 'reading' ? (
              <div role="status" className="pt-16 text-center">
                <p className="text-[20px] font-semibold">{t.reading.title}</p>
                <p className="mt-2 text-[15px] font-medium text-[var(--ink-secondary)]">{t.reading.body}</p>
              </div>
            ) : null}

            {step === 'summary' ? (
              <div>
                <h1 className="text-[26px] font-semibold tracking-[-0.03em]">{t.summary.title}</h1>
                <p className="mt-2 text-[15px] text-[var(--ink-secondary)]">{q.summarySub}</p>

                {postKind && card ? (
                  <section aria-label={postKind === 'offer' ? q.offer : q.request} data-first-post={postKind} className="mt-5 rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-4">
                    <p className="flex items-center gap-2 text-[14px] text-[var(--ink-secondary)]">
                      <span className="rounded-[8px] bg-[var(--raised)] px-2 py-1 font-medium">{postKind === 'offer' ? q.offer : q.request}</span>
                      {tag ? <span>{tag} · {q.newOn}</span> : null}
                    </p>
                    <p dir="auto" className="mt-3 text-[20px] font-semibold">{(postKind === 'offer' ? card.what : card.buy) ?? ''}</p>
                    {postKind === 'offer' && priceText(card) ? <p className="mt-1 text-[24px] font-semibold tabular-nums">{priceText(card)}</p> : null}
                    {postKind === 'request' && card.buyMax ? <p className="mt-1 text-[24px] font-semibold tabular-nums">{q.upTo.replace('{money}', money.text(card.buyMax))}</p> : null}
                    <p className="mt-1 text-[14px] text-[var(--ink-secondary)]">
                      {[postKind === 'offer' && daysText(card) ? q.delivers.replace('{days}', daysText(card)!.toLocaleLowerCase(locale)) : null, regionName(answers.place?.country)].filter(Boolean).join(' · ')}
                    </p>
                    {!destination ? (
                      <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 text-[15px] font-medium">
                        <input type="checkbox" checked={postNow} onChange={(e) => setPostNow(e.target.checked)} className="size-5 shrink-0 accent-[var(--ink)]" />
                        {q.postNow}
                      </label>
                    ) : null}
                  </section>
                ) : null}

                <dl className="mt-4 rounded-[20px] border border-[var(--line)] bg-[var(--surface)] px-4">
                  {tag ? <SummaryRow label={q.rows.tag} value={tag} /> : null}
                  <SummaryRow label={q.rows.where} value={[answers.place?.city, regionName(answers.place?.country)].filter(Boolean).join(', ')} change={rowChange} onChange={() => dispatch({ type: 'goto', step: 'where' })} />
                  <SummaryRow label={q.rows.reach} value={reachText} change={rowChange} onChange={() => dispatch({ type: 'goto', step: 'where' })} />
                  <SummaryRow label={q.rows.agent} value={selling && card?.priceMin === null ? q.agentAsks : q.agentOffers} last />
                </dl>

                <p className="mt-4 flex items-start gap-2.5 text-[14px] leading-relaxed text-[var(--ink-secondary)]">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="mt-0.5 shrink-0 text-[var(--ink)]"><rect width="18" height="11" x="3" y="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                  <span>{q.held}</span>
                </p>

                <button type="button" onClick={() => void save()} disabled={saving} aria-busy={saving} className={`${PRIMARY} mt-6 w-full`}>{saving ? q.saving : q.done}</button>
                <button type="button" onClick={() => dispatch({ type: 'edit' })} disabled={saving} className="mt-2 inline-flex min-h-11 w-full items-center justify-center text-[15px] font-medium text-[var(--ink-secondary)] hover:text-[var(--ink)]">{t.summary.change}</button>
              </div>
            ) : null}
          </m.section>
        </AnimatePresence>

        {error ? <p role="alert" className="mt-4 border-s-2 border-[var(--color-critical)] ps-3 text-[14px]">{error}</p> : null}

        {asking ? (
          <button type="button" onClick={() => dispatch({ type: 'next' })} disabled={!canGoOn(step, answers)} className={`${PRIMARY} mt-8 w-full disabled:opacity-40`}>{t.buttons.next}</button>
        ) : null}
      </div>
    </div>
  );
}

/// Aman's one line under a step: what the answer is used for.
function AmanLine({ children }: { children: string }) {
  return (
    <p className="mt-6 flex items-start gap-2.5 text-[14px] leading-relaxed text-[var(--ink-secondary)]" aria-live="polite">
      <span className="shrink-0"><AmanFace size={28} mood="talking" label={null} /></span>
      <span className="pt-1">{children}</span>
    </p>
  );
}

/// One line in the person's own words, with examples to tap.
function Line({ id, label, value, placeholder, examples, onChange }: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  examples: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="mt-6">
      <label htmlFor={id} className="block text-[15px] font-semibold text-[var(--ink)]">{label}</label>
      <textarea
        id={id}
        value={value}
        rows={2}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        dir="auto"
        className="mt-2 block w-full resize-none rounded-[14px] border border-[var(--line-strong)] bg-[var(--surface)] px-4 py-3.5 text-[17px] leading-snug text-[var(--ink)] focus-visible:border-[var(--ink)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ink)]"
      />
      <div className="mt-2.5 flex flex-wrap gap-2">
        {examples.map((x) => (
          <button key={x} type="button" onClick={() => onChange(x)} className="min-h-11 rounded-full border border-[var(--line-strong)] px-3.5 text-[14px] font-medium text-[var(--ink-secondary)] hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]">
            {x}
          </button>
        ))}
      </div>
    </div>
  );
}

function SummaryRow({ label, value, change, onChange, last = false }: { label: string; value: string; change?: string; onChange?: () => void; last?: boolean }) {
  return (
    <div className={`flex min-h-14 items-center gap-3 py-2 ${last ? '' : 'border-b border-[var(--line)]'}`}>
      <dt className="shrink-0 text-[16px]">{label}</dt>
      <dd className="flex min-w-0 flex-1 items-center justify-end gap-2">
        <span dir="auto" className="min-w-0 truncate text-[15px] text-[var(--ink-secondary)]">{value}</span>
        {change && onChange ? (
          <button type="button" onClick={onChange} className="inline-flex min-h-11 shrink-0 items-center px-1 text-[14px] font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]">
            {change}
            <span className="sr-only"> {label}</span>
          </button>
        ) : null}
      </dd>
    </div>
  );
}
