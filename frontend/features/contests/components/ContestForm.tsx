'use client';
import { MoneyInput } from '@/features/money/components/MoneyInput';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, api, type ContestCard, type ContestInput } from '@/core/api';
import { fill } from '@/features/deals/workspace/presentation';
import { Sheet, fieldLabel, primaryButton, quietButton } from '@/features/deals/workspace/Sheet';
import { Hint } from '@/shared/components/Hint';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { ALERT, FIELD, PRIMARY } from '@/shared/ui/controls';
import { MAX_WINNERS, SUGGESTED, equalShares, microsToUsdc, ownShares, splitAmounts, type Split } from '../contestModel';
import { useMoneyText } from '@/features/money/hooks/useMoneyText';

type Kind = NonNullable<ContestInput['kind']>;
/// Entry and judging periods per kind, in days (view 88); the server's KINDS.
const KINDS: Record<Kind, { entries: [number, number]; judging: [number, number]; judgingDefault: number }> = {
  design: { entries: [1, 30], judging: [3, 14], judgingDefault: 7 },
  bugs: { entries: [1, 60], judging: [3, 30], judgingDefault: 14 },
  hackathon: { entries: [1, 60], judging: [3, 30], judgingDefault: 14 },
};

const CHIP = 'min-h-11 rounded-full border px-4 text-[15px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]';
const chip = (on: boolean) => `${CHIP} ${on ? 'border-[var(--lp-dark)] bg-[var(--lp-dark)] text-[var(--lp-bg)]' : 'border-[var(--lp-border-light)] bg-[var(--tint)] text-[var(--lp-dark)]'}`;
const STEP = 'flex h-11 w-11 items-center justify-center rounded-full border border-[var(--lp-border-light)] bg-[var(--tint)] text-[20px] font-semibold text-[var(--lp-dark)] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]';

function startSplit(prefill: Partial<ContestInput>, places: number): { split: Split; own: (number | null)[] } {
  const s = prefill.shares;
  const prize = Number(prefill.prizeUsdc);
  if (!s || s.length !== places) return { split: 'suggested', own: [] };
  if (s.join() === SUGGESTED[places]!.join()) return { split: 'suggested', own: [] };
  if (s.join() === equalShares(places).join()) return { split: 'equal', own: [] };
  return { split: 'own', own: prize > 0 ? splitAmounts(prize, s) : s.map(() => null) };
}

/// Run a contest (views 40 and 88): the kind, what it is for, the prize, one
/// to eight winners and how the prize is shared, how long entries stay open
/// and how long the buyer judges; then one sheet with every figure and date
/// before the buying agent puts up the prize.
export function ContestForm({ prefill }: { prefill: Partial<ContestInput> }) {
  const mt = useMoneyText({ compact: true });
  const t = useTranslations().contests;
  const { locale } = useLocale();
  const router = useRouter();
  const [kind, setKind] = useState<Kind>(prefill.kind && prefill.kind in KINDS ? prefill.kind : 'design');
  const [title, setTitle] = useState(prefill.title ?? '');
  const [brief, setBrief] = useState(prefill.brief ?? '');
  const [prize, setPrize] = useState(prefill.prizeUsdc ?? '');
  const [places, setPlaces] = useState(prefill.places && prefill.places >= 1 && prefill.places <= MAX_WINNERS ? prefill.places : 1);
  const [split, setSplit] = useState<Split>(() => startSplit(prefill, places).split);
  const [own, setOwn] = useState<(number | null)[]>(() => startSplit(prefill, places).own);
  const [days, setDays] = useState(String(prefill.entriesDays ?? 7));
  const [judge, setJudge] = useState(String(prefill.awardDays ?? KINDS[kind].judgingDefault));
  const [card, setCard] = useState<ContestCard | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const limits = KINDS[kind];
  const prizeN = Number(prize);
  const amounts = Array.from({ length: places }, (_, i) => own[i] ?? null);
  const mine = ownShares(amounts, prizeN);
  const shares = split === 'own' ? mine.shares : split === 'equal' ? equalShares(places) : SUGGESTED[places]!;
  const input = (): ContestInput => ({
    title, brief, prizeUsdc: prize, places, entriesDays: Number(days), awardDays: Number(judge), kind,
    ...(shares && split !== 'suggested' ? { shares } : {}),
  });
  const date = (ms: number) => new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(ms);
  const usdc = (m: string) => mt.text(microsToUsdc(m));
  const inRange = (v: string, [lo, hi]: [number, number]) => Number(v) >= lo && Number(v) <= hi;

  function pickKind(k: Kind) {
    setKind(k);
    setJudge(String(KINDS[k].judgingDefault));
  }
  function setWinners(n: number) {
    setPlaces(n);
    setOwn((o) => Array.from({ length: n }, (_, i) => o[i] ?? null));
  }

  async function review() {
    setError(null);
    setBusy(true);
    try {
      setCard((await api.draftContest(input())).card);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.failed);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.postContest(input());
      router.push(`/contests/${r.contest.id}`);
    } catch (err) {
      const need = err instanceof ApiError ? (err.body as { needMicros?: string } | undefined)?.needMicros : undefined;
      setError(need ? mt.fill(t.card.short, { amount: microsToUsdc(need) }) : err instanceof ApiError ? err.message : t.failed);
      setBusy(false);
    }
  }

  const ready = title.trim() && brief.trim() && prizeN > 0 && !!shares && inRange(days, limits.entries) && inRange(judge, limits.judging);
  const kinds: Kind[] = ['design', 'bugs', 'hackathon'];
  const placeName = (i: number) => fill(t.form.placeAmount, { place: t.page.places[i]! });
  const dayField = (label: string, hint: string, value: string, set: (v: string) => void, id: string) => (
    <div>
      <span className={`${fieldLabel} inline-flex items-center gap-1.5`}>
        <label htmlFor={id}>{label}</label>
        <Hint side="bottom">{hint}</Hint>
      </span>
      <span className="mt-2 flex items-center gap-3">
        <input id={id} className={`${FIELD} w-24 tabular-nums`} inputMode="numeric" value={value} onChange={(e) => set(e.target.value.replace(/\D/g, '').slice(0, 2))} />
        <span className="text-[15px] text-[var(--lp-text-sub)]">{t.form.dayUnit}</span>
      </span>
    </div>
  );

  return (
    <main className="mx-auto w-full max-w-[760px] px-4 pb-16 pt-8 sm:px-6">
      <h1 className="text-[28px] font-semibold text-[var(--lp-dark)]">{t.form.title}</h1>
      <div className="mt-6 space-y-5">
        <fieldset>
          <legend className={fieldLabel}>{t.form.kind}</legend>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={t.form.kind}>
            {kinds.map((k) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => pickKind(k)} className={chip(kind === k)}>
                {t.form.kinds[k]}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="block">
          <span className={fieldLabel}>{t.form.what}</span>
          <input className={`${FIELD} mt-2`} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="block">
          <span className={fieldLabel}>{t.form.brief}</span>
          <textarea className={`${FIELD} mt-2 min-h-32 py-3`} value={brief} maxLength={1500} onChange={(e) => setBrief(e.target.value)} />
          <span className="mt-1 block text-[14px] text-[var(--lp-text-sub)]">{t.form.briefHint}</span>
        </label>
        <label className="block">
          <span className={fieldLabel}>{t.form.prize}</span>
          <span className="mt-2 block"><MoneyInput value={prize} onChange={(v) => setPrize(v === null ? '' : String(v))} className={`${FIELD} tabular-nums`} /></span>
        </label>

        <div>
          <span id="winners-label" className={fieldLabel}>{t.form.places}</span>
          <div className="mt-2 flex items-center gap-3" role="group" aria-labelledby="winners-label">
            <button type="button" aria-label={t.form.fewer} disabled={places <= 1} onClick={() => setWinners(places - 1)} className={STEP}>−</button>
            <output aria-live="polite" className="min-w-8 text-center text-[20px] font-semibold tabular-nums text-[var(--lp-dark)]">{places}</output>
            <button type="button" aria-label={t.form.more} disabled={places >= MAX_WINNERS} onClick={() => setWinners(places + 1)} className={STEP}>+</button>
            <span className="text-[15px] text-[var(--lp-text-sub)]">{fill(t.form.placesOf, { n: MAX_WINNERS })}</span>
          </div>
        </div>

        {places > 1 ? (
          <fieldset>
            <legend className={`${fieldLabel} inline-flex items-center gap-1.5`}>
              {t.form.split}
              <Hint side="bottom">{t.form.splitHint}</Hint>
            </legend>
            <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={t.form.split}>
              {(['suggested', 'equal', 'own'] as const).map((s) => (
                <button key={s} type="button" role="radio" aria-checked={split === s} onClick={() => setSplit(s)} className={chip(split === s)}>
                  {t.form.splits[s]}
                </button>
              ))}
            </div>
            {split !== 'own' && prizeN > 0 && shares ? (
              <p data-split-line className="mt-2 text-[14px] tabular-nums text-[var(--lp-text-sub)]">
                {splitAmounts(prizeN, shares).map((a) => mt.text(a)).join(' · ')}
              </p>
            ) : null}
            {split === 'own' ? (
              <div className="mt-3 space-y-3">
                {amounts.map((a, i) => (
                  <label key={i} className="flex items-center justify-between gap-4">
                    <span className="text-[15px] text-[var(--lp-dark)]">{placeName(i)}</span>
                    <span className="w-44 shrink-0">
                      <MoneyInput
                        value={a}
                        ariaLabel={placeName(i)}
                        onChange={(v) => setOwn((o) => Array.from({ length: places }, (_, j) => (j === i ? v : o[j] ?? null)))}
                        className={`${FIELD} tabular-nums`}
                      />
                    </span>
                  </label>
                ))}
                {prizeN > 0 ? (
                  <p role="status" data-split-sum className={`text-[14px] font-semibold tabular-nums ${Math.abs(mine.left) <= 0.01 ? 'text-[var(--lp-text-sub)]' : 'text-[var(--lp-dark)]'}`}>
                    {Math.abs(mine.left) <= 0.01
                      ? mt.fill(t.form.addsUp, { amount: prizeN })
                      : mine.left > 0
                        ? mt.fill(t.form.left, { amount: mine.left })
                        : mt.fill(t.form.over, { amount: -mine.left })}
                  </p>
                ) : null}
              </div>
            ) : null}
          </fieldset>
        ) : null}

        {dayField(t.form.days, fill(t.form.daysHint, { min: limits.entries[0], max: limits.entries[1] }), days, setDays, 'contest-days')}
        {dayField(t.form.judge, fill(t.form.judgeHint, { min: limits.judging[0], max: limits.judging[1] }), judge, setJudge, 'contest-judge')}
      </div>
      {error && !card ? <p role="alert" className={`${ALERT} mt-5`}>{error}</p> : null}
      <button type="button" disabled={!ready || busy} onClick={() => void review()} className={`${PRIMARY} mt-8 w-full sm:w-auto`}>
        {t.form.review}
      </button>

      <Sheet open={!!card} title={t.card.title} busy={busy} onClose={() => { setCard(null); setError(null); }}>
        {card ? (
          <>
            <p className="text-[32px] font-semibold tabular-nums text-[var(--lp-dark)]">{usdc(card.totalMicros)}</p>
            <dl className="mt-4 divide-y divide-[var(--lp-border-light)] border-y border-[var(--lp-border-light)] text-[15px]">
              {[
                [t.card.prize, usdc(card.prizeMicros)],
                [t.card.fee, usdc(card.feeHalfMicros)],
                ...card.placeNetMicros.map((m, i) => [t.card.placeGets[i]!, usdc(m)] as const),
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-3">
                  <dt className="text-[var(--lp-text-sub)]">{k}</dt>
                  <dd className="font-semibold tabular-nums text-[var(--lp-dark)]">{v}</dd>
                </div>
              ))}
            </dl>
            <dl data-contest-dates className="mt-4 divide-y divide-[var(--lp-border-light)] rounded-[16px] border border-[var(--lp-border-light)] px-4 text-[15px]">
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-[var(--lp-text-sub)]">{t.card.closes}</dt>
                <dd className="font-semibold text-[var(--lp-dark)]">{date(card.entriesBy)}</dd>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-[var(--lp-text-sub)]">{card.payoutFrom ? t.card.judgingEnds : t.card.pickBy}</dt>
                <dd className="font-semibold text-[var(--lp-dark)]">{date(card.awardBy)}</dd>
              </div>
              {card.payoutFrom ? (
                <div className="flex justify-between gap-4 py-3">
                  <dt className="inline-flex items-center gap-1.5 text-[var(--lp-text-sub)]">{t.card.ifNobody}<Hint side="top">{card.ifNobody}</Hint></dt>
                  <dd className="font-semibold text-[var(--lp-dark)]">{fill(t.card.paidOut, { date: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(card.payoutFrom) })}</dd>
                </div>
              ) : null}
            </dl>
            {card.payoutFrom ? null : <p className="mt-4 text-[14px] text-[var(--lp-text-sub)]">{card.ifNobody}</p>}
            {error ? <p role="alert" className={`${ALERT} mt-4`}>{error}</p> : null}
            <div className="mt-6 space-y-3">
              <button type="button" disabled={busy} onClick={() => void confirm()} className={primaryButton}>
                {mt.fill(t.card.confirm, { amount: microsToUsdc(card.totalMicros) })}
              </button>
              <button type="button" disabled={busy} onClick={() => setCard(null)} className={quietButton}>{t.notNow}</button>
            </div>
          </>
        ) : null}
      </Sheet>
    </main>
  );
}
