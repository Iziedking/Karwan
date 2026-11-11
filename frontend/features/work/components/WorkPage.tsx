'use client';

import { CARD_CLASS } from '@/shared/components/Card';
import { buttonClasses } from '@/shared/components/Button';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, type WorkView, type WorkWeekView } from '@/core/api';
import { fill } from '@/features/deals/workspace/presentation';
import { Sheet, fieldLabel, primaryButton, quietButton } from '@/features/deals/workspace/Sheet';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { ALERT } from '@/shared/ui/controls';
import { hoursText, localDay, microsToUsdc, minutesFrom, monthLine, runsText, sessionPrice, sessionRows, validLink, weekLine, workActions } from '../workModel';
import { StepsTrack } from '@/features/deals/workspace/StepsTrack';
import { workSteps } from '../workSteps';
import { useMoneyText } from '@/features/money/hooks/useMoneyText';

const GREEN = buttonClasses({ size: 'lg' });
const QUIET_BUTTON = buttonClasses({ variant: 'secondary', size: 'lg' });

type SheetKind =
  | { kind: 'accept' | 'decline' | 'takeBack' | 'fund' | 'notice' }
  | { kind: 'log'; k: number }
  | { kind: 'approve'; w: WorkWeekView }
  | { kind: 'object'; w: WorkWeekView }
  | { kind: 'flag'; w: WorkWeekView };

/// One piece of hourly work (view 32), the same page for both sides. The
/// rate and this week's hours lead; each money step opens the confirm sheet.
/// Monthly work counted in sessions lists each session in its month (view 76).
export function WorkPage({ id }: { id: string }) {
  const mt = useMoneyText({ compact: true });
  const t = useTranslations().work;
  const { locale } = useLocale();
  const [v, setV] = useState<WorkView | null>(null);
  const [missing, setMissing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [h, setH] = useState('');
  const [m, setM] = useState('');
  const [note, setNote] = useState('');
  const [link, setLink] = useState('');
  const [pick, setPick] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.getWork(id).then((r) => { setV(r.work); setNow(Date.now()); }).catch((err) => { if (err instanceof ApiError && err.status === 404) setMissing(true); });
  }, [id]);
  useEffect(() => {
    load();
    const poll = window.setInterval(load, 15_000);
    return () => window.clearInterval(poll);
  }, [load]);

  if (missing) return <main className="mx-auto max-w-[760px] px-4 pt-8 sm:px-6"><p className="text-[15px] text-[var(--ink-secondary)]">{t.failed}</p></main>;
  if (!v) return null;

  const hourly = v.kind === 'hourly';
  const ts = t.sessions;
  const bySession = !hourly && !!v.sessions;
  const each = sessionPrice(v.rateMicros, v.sessions);
  const usdc = (micros: string) => mt.text(microsToUsdc(micros));
  const day = (ms: number) => localDay(ms, locale);
  const periodName = (k: number) => fill(hourly ? t.page.week : t.page.month, { n: k + 1 });
  const close = () => { setSheet(null); setError(null); setH(''); setM(''); setNote(''); setLink(''); setPick(null); };
  const run = async (step: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await step();
      close();
      load();
    } catch (err) {
      const need = err instanceof ApiError ? (err.body as { needMicros?: string } | undefined)?.needMicros : undefined;
      setError(need ? mt.fill(t.card.short, { amount: microsToUsdc(need) }) : err instanceof ApiError ? err.message : t.failed);
    } finally {
      setBusy(false);
    }
  };
  // On sessions the objection is a count of sessions, typed in the one field.
  const minutes = hourly ? minutesFrom(h, m) : bySession && sheet?.kind === 'object' ? (/^\d+$/.test(h) && Number(h) > 0 ? Number(h) : null) : 1;
  const sessionCount = (n: number) => fill(ts.count, { n, most: v.sessions ?? 0 });
  const actions = workActions(v);
  const other = v.role === 'hirer' ? fill(t.page.hiring, { name: v.workerName }) : fill(t.page.hiredBy, { name: v.hirerName });
  const lastK = v.runs - 1;
  // The one date each side needs on a month of sessions.
  const sessionDate = (w: WorkWeekView) => {
    const at = monthLine(w, v.role, now);
    return at === 'review-after' ? fill(ts.reviewAfter, { date: day(w.end) }) : at === 'record-by' ? fill(ts.recordBy, { date: day(w.logBy) }) : fill(t.page.reviewBy, { date: day(w.reviewBy) });
  };
  // One primary button on the screen: the newest week's step if it has one,
  // else the first step on the work as a whole.
  const primaryWeek = [...v.weeks].reverse().find((w) => w.canLog || w.canApprove)?.k ?? null;
  // The steps of the week in hand: the newest one still open, else the last.
  const trackWeek = [...v.weeks].reverse().find((w) => w.status !== 'settled') ?? v.weeks.at(-1) ?? null;

  return (
    <main className="mx-auto w-full max-w-[760px] px-4 pb-16 pt-8 sm:px-6">
      <p className="text-[14px] font-semibold text-[var(--ink-secondary)]">{t.page.status[v.status]}</p>
      <h1 dir="auto" className="mt-1 text-[26px] font-semibold leading-tight tracking-[-0.02em] text-[var(--ink)]">{v.title}</h1>
      <p className="mt-1 text-[15px] text-[var(--ink-secondary)]">{other}</p>
      <div className={`${CARD_CLASS} mt-5 px-5 py-4`}>
      <p className="text-[24px] font-semibold tabular-nums text-[var(--ink)]">
        {mt.fill(hourly ? t.page.rateHour : t.page.rateMonth, { amount: microsToUsdc(v.rateMicros) })}
      </p>
      <p className="mt-1 text-[15px] text-[var(--ink-secondary)]">
        {[hourly ? fill(t.page.upTo, { n: v.maxHours }) : null, bySession ? fill(ts.term, { n: v.sessions ?? 0 }) : null, each ? mt.fill(ts.each, { amount: microsToUsdc(each) }) : null, runsText(v.runs, hourly, t.page), fill(t.page.starts, { date: day(v.startsAt) })].filter(Boolean).join(' · ')}
      </p>
      </div>
      {v.status === 'ending' ? <p className="mt-1 text-[15px] font-semibold text-[var(--ink)]">{fill(hourly ? t.page.endsAfterWeek : t.page.endsAfterMonth, { n: lastK + 1 })}</p> : null}
      {v.brief ? <p dir="auto" className="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-[var(--ink)]">{v.brief}</p> : null}
      {trackWeek ? (
        <div data-steps-card className={`${CARD_CLASS} mt-6 p-5`}>
          <p className="mb-4 text-[14px] font-semibold text-[var(--ink-secondary)]">{periodName(trackWeek.k)}</p>
          <StepsTrack steps={workSteps(trackWeek, bySession)} />
        </div>
      ) : null}

      {actions.length > 0 ? (
        <div className="mt-6 flex flex-wrap gap-3">
          {actions.map((a, i) => {
            const label = {
              accept: t.page.accept,
              decline: t.page.decline,
              takeBack: t.page.takeBack,
              fund: v.nextWeek ? fill(hourly ? t.page.fundWeek : t.page.fundMonth, { n: v.nextWeek.k + 1 }) : '',
              notice: t.page.notice,
            }[a];
            return (
              <button key={a} type="button" onClick={() => setSheet({ kind: a })} className={primaryWeek === null && i === 0 && a !== 'notice' ? GREEN : QUIET_BUTTON}>
                {label}
              </button>
            );
          })}
        </div>
      ) : null}
      {v.role === 'hirer' && v.fundBlocked && (v.status === 'active' || v.status === 'ending') && v.weeks.length < v.runs ? (
        <p className="mt-3 text-[14px] text-[var(--ink-secondary)]">{v.fundBlocked}</p>
      ) : null}

      <ul className="mt-8 space-y-3">
        {[...v.weeks].reverse().map((w) => {
          const line = weekLine(w, now);
          const status =
            line === 'settled'
              ? [w.paidNetMicros && BigInt(w.paidNetMicros) > 0n ? mt.fill(t.page.paid, { amount: microsToUsdc(w.paidNetMicros) }) : null, w.backMicros && BigInt(w.backMicros) > 0n ? mt.fill(t.page.back, { amount: microsToUsdc(w.backMicros) }) : null].filter(Boolean).join(' · ')
              : line === 'with-review' ? t.page.withReview
              : bySession && line !== 'not-started' ? sessionDate(w)
              : line === 'in-review' ? fill(t.page.reviewBy, { date: day(w.reviewBy) })
              : line === 'logging' ? fill(t.page.logBy, { date: day(w.logBy) })
              : fill(t.page.starts, { date: day(w.start) });
          return (
            <li key={w.k} className={`${CARD_CLASS} px-5 py-4`}>
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-[17px] font-semibold text-[var(--ink)]">{periodName(w.k)}</span>
                <span className="text-[15px] font-semibold tabular-nums text-[var(--ink)]">
                  {hourly
                    ? (w.loggedMinutes ? fill(t.page.logged, { hours: hoursText(w.loggedMinutes), most: hoursText(v.maxHours * 60) }) : t.page.nothingLogged)
                    : bySession ? (w.loggedMinutes ? sessionCount(w.loggedMinutes) : ts.none)
                    : (w.loggedMinutes ? t.page.claimed : t.page.nothingLogged)}
                </span>
              </div>
              <p className="mt-1 text-[14px] text-[var(--ink-secondary)]">{status}</p>
              {bySession && w.log.length > 0 ? (
                <ul data-sessions className="mt-3 divide-y divide-[var(--line)] border-t border-[var(--line)]">
                  {sessionRows(w).map((x) => (
                    <li key={x.n} className="py-3">
                      <div className="flex items-baseline justify-between gap-4">
                        <span className="text-[15px] font-semibold text-[var(--ink)]">{fill(ts.session, { n: x.n })}</span>
                        <span className="shrink-0 text-[14px] tabular-nums text-[var(--ink-secondary)]">{day(x.at)}</span>
                      </div>
                      {x.note ? <p dir="auto" className="mt-1 text-[14px] text-[var(--ink-secondary)]">{x.note}</p> : null}
                      {x.link ? <a href={x.link} target="_blank" rel="noreferrer noopener" className="mt-1 inline-flex min-h-11 items-center text-[14px] font-medium text-[var(--ink)] underline underline-offset-2">{ts.link}</a> : null}
                      {x.flagged ? (
                        <p dir="auto" className="mt-2 rounded-[10px] bg-[var(--ash)] px-3 py-2 text-[14px] font-medium text-[var(--ink)]">
                          {v.role === 'hirer' ? fill(ts.youSaid, { note: x.flagged.note }) : fill(ts.theySaid, { name: v.hirerName, note: x.flagged.note })}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : !bySession && w.log.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {w.log.filter((x) => x.note).map((x) => (
                    <li key={x.at} dir="auto" className="text-[14px] text-[var(--ink-secondary)]">{hourly ? `${hoursText(x.minutes)} · ` : ''}{x.note}</li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-3">
                {w.canLog ? <button type="button" onClick={() => setSheet({ kind: 'log', k: w.k })} className={primaryWeek === w.k ? GREEN : QUIET_BUTTON}>{hourly ? t.page.logHours : bySession ? ts.record : t.page.claimMonth}</button> : null}
                {w.canApprove ? (
                  <button type="button" onClick={() => setSheet({ kind: 'approve', w })} className={primaryWeek === w.k ? GREEN : QUIET_BUTTON}>
                    {hourly ? fill(t.page.approve, { hours: hoursText(w.loggedMinutes) }) : bySession ? (w.loggedMinutes - w.approvedMinutes === 1 ? ts.approveOne : fill(ts.approve, { n: w.loggedMinutes - w.approvedMinutes })) : t.page.approveMonth}
                  </button>
                ) : null}
                {w.canObject ? <button type="button" onClick={() => setSheet({ kind: 'object', w })} className={QUIET_BUTTON}>{bySession ? ts.someNot : t.page.wrong}</button> : null}
                {w.canFlag && !w.canObject ? <button type="button" onClick={() => setSheet({ kind: 'flag', w })} className={QUIET_BUTTON}>{ts.didNot}</button> : null}
              </div>
            </li>
          );
        })}
        {v.weeks.length < v.runs && (v.status === 'active' || v.status === 'ending') ? (
          <li className={`${CARD_CLASS} px-5 py-4`}>
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-[17px] font-semibold text-[var(--ink)]">{periodName(v.weeks.length)}</span>
              <span className="text-[15px] text-[var(--ink-secondary)]">{t.page.notFunded}</span>
            </div>
          </li>
        ) : null}
      </ul>

      <Sheet open={!!sheet} title={sheetTitle()} busy={busy} onClose={close}>
        {sheet ? sheetBody() : null}
      </Sheet>
    </main>
  );

  function sheetTitle(): string {
    if (!sheet) return '';
    switch (sheet.kind) {
      case 'log': return hourly ? t.sheets.log.title : bySession ? ts.record : t.sheets.log.claim;
      case 'approve': return t.sheets.approve.title;
      case 'object': return bySession ? ts.objectTitle : t.sheets.object.title;
      case 'flag': return ts.flagTitle;
      case 'fund': return t.sheets.fund.title;
      case 'notice': return t.sheets.notice.title;
      case 'accept': return t.sheets.accept.title;
      case 'decline': return t.sheets.decline.title;
      case 'takeBack': return t.sheets.takeBack.title;
    }
  }

  function buttons(label: string, go: () => Promise<unknown>, disabled = false) {
    return (
      <>
        {error ? <p role="alert" className={`${ALERT} mt-4`}>{error}</p> : null}
        <div className="mt-6 space-y-3">
          <button type="button" disabled={busy || disabled} onClick={() => void run(go)} className={primaryButton}>{label}</button>
          <button type="button" disabled={busy} onClick={close} className={quietButton}>{t.notNow}</button>
        </div>
      </>
    );
  }

  function sheetBody() {
    if (!sheet || !v) return null;
    const body = (text: string) => <p className="text-[15px] leading-relaxed text-[var(--ink)]">{text}</p>;
    switch (sheet.kind) {
      case 'accept':
        return <>{body(t.sheets.accept.body)}{buttons(t.sheets.accept.confirm, () => api.acceptWork(v.id))}</>;
      case 'decline':
        return <>{body(t.sheets.decline.body)}{buttons(t.sheets.decline.confirm, () => api.declineWork(v.id))}</>;
      case 'takeBack':
        return <>{body(t.sheets.takeBack.body)}{buttons(t.sheets.takeBack.confirm, () => api.cancelWork(v.id))}</>;
      case 'notice':
        return <>{body(t.sheets.notice.body)}{buttons(t.sheets.notice.confirm, () => api.noticeWork(v.id))}</>;
      case 'fund':
        return (
          <>
            <p className="text-[32px] font-semibold tabular-nums text-[var(--ink)]">{usdc(v.nextWeek?.totalMicros ?? '0')}</p>
            <p className="mt-2 text-[15px] text-[var(--ink-secondary)]">{t.sheets.fund.body}</p>
            {buttons(mt.fill(t.sheets.fund.confirm, { amount: microsToUsdc(v.nextWeek?.totalMicros ?? '0') }), () => api.fundWork(v.id))}
          </>
        );
      case 'approve':
        return (
          <>
            <p className="text-[32px] font-semibold tabular-nums text-[var(--ink)]">{usdc(sheet.w.ifPaid.netMicros)}</p>
            <p className="mt-1 text-[15px] text-[var(--ink-secondary)]">{t.sheets.approve.gets}</p>
            {bySession ? (
              <dl className={`${CARD_CLASS} mt-4 divide-y divide-[var(--line)] px-5 text-[15px]`}>
                {[[t.card.fee, usdc(sheet.w.ifPaid.feeMicros)], [ts.back, usdc(sheet.w.ifPaid.backMicros)]].map(([k, val]) => (
                  <div key={k} className="flex justify-between gap-4 py-3">
                    <dt className="text-[var(--ink-secondary)]">{k}</dt>
                    <dd className="font-semibold tabular-nums text-[var(--ink)]">{val}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            <p className="mt-4 text-[15px] text-[var(--ink)]">{bySession ? ts.approveBody : t.sheets.approve.body}</p>
            {buttons(t.sheets.approve.confirm, () => api.approveHours(v.id, sheet.w.k))}
          </>
        );
      case 'object': {
        const most = sheet.w.loggedMinutes - sheet.w.approvedMinutes;
        const ok = minutes !== null && minutes <= most && note.trim().length > 0;
        return (
          <>
            <p className="text-[15px] leading-relaxed text-[var(--ink)]">{t.sheets.object.body}</p>
            {bySession ? (
              <label className="mt-4 block">
                <span className={fieldLabel}>{ts.objectCount}</span>
                <input className="form-input block w-full mt-2 tabular-nums" inputMode="numeric" value={h} onChange={(e) => setH(e.target.value.replace(/\D/g, '').slice(0, 2))} />
              </label>
            ) : (
            <fieldset className="mt-4">
              <legend className={fieldLabel}>{t.sheets.object.hours}</legend>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <input aria-label={t.sheets.log.hours} className={`form-input block w-full tabular-nums`} inputMode="numeric" placeholder={t.sheets.log.hours} value={h} onChange={(e) => setH(e.target.value.replace(/\D/g, '').slice(0, 2))} />
                <input aria-label={t.sheets.log.minutes} className={`form-input block w-full tabular-nums`} inputMode="numeric" placeholder={t.sheets.log.minutes} value={m} onChange={(e) => setM(e.target.value.replace(/\D/g, '').slice(0, 2))} />
              </div>
            </fieldset>
            )}
            <label className="mt-4 block">
              <span className={fieldLabel}>{t.sheets.object.why}</span>
              <textarea className={`form-input block w-full mt-2 min-h-24 py-3`} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
            </label>
            {buttons(t.sheets.object.confirm, () => api.objectHours(v.id, { k: sheet.w.k, minutes: minutes ?? 0, reason: note.trim() }), !ok)}
          </>
        );
      }
      case 'flag': {
        const w = sheet.w;
        const ok = pick !== null && note.trim().length > 0;
        return (
          <>
            <div role="radiogroup" aria-label={ts.flagTitle} className="flex flex-wrap gap-2">
              {sessionRows(w).map((x) => (
                <button key={x.n} type="button" role="radio" aria-checked={pick === x.n} onClick={() => setPick(x.n)}
                  className={`inline-flex min-h-11 items-center rounded-full border px-4 text-[15px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)] ${pick === x.n ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--surface)]' : 'border-[var(--line)] text-[var(--ink)]'}`}>
                  {fill(ts.session, { n: x.n })}
                </button>
              ))}
            </div>
            <label className="mt-4 block">
              <span className={fieldLabel}>{ts.flagWhat}</span>
              <textarea className="form-input block w-full mt-2 min-h-24 py-3" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
            </label>
            <p className="mt-4 rounded-[14px] bg-[var(--ash)] px-3.5 py-3 text-[14px] text-[var(--ink)]">{ts.flagBody}</p>
            {buttons(ts.flagConfirm, () => api.flagSession(v.id, { k: w.k, n: pick ?? 0, note: note.trim() }), !ok)}
          </>
        );
      }
      case 'log': {
        const k = sheet.k;
        if (bySession) {
          const done = v.weeks.find((x) => x.k === k)?.loggedMinutes ?? 0;
          const url = link.trim();
          return (
            <>
              <p className="text-[15px] text-[var(--ink-secondary)]">{fill(ts.logCount, { n: done + 1, most: v.sessions ?? 0 })}</p>
              <label className="mt-4 block">
                <span className={fieldLabel}>{ts.logNote}</span>
                <textarea className="form-input block w-full mt-2 min-h-24 py-3" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
              </label>
              <label className="mt-4 block">
                <span className={fieldLabel}>{ts.logLink} <span className="font-normal text-[var(--ink-secondary)]">{ts.optional}</span></span>
                <input className="form-input block w-full mt-2" dir="ltr" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="https://" value={link} maxLength={300} onChange={(e) => setLink(e.target.value)} />
              </label>
              <p className="mt-4 rounded-[14px] bg-[var(--ash)] px-3.5 py-3 text-[14px] text-[var(--ink)]">{fill(ts.told, { name: v.hirerName })}</p>
              {buttons(ts.logConfirm, () => api.logHours(v.id, { minutes: 1, note: note.trim(), k, ...(url ? { link: url } : {}) }), !validLink(link))}
            </>
          );
        }
        return (
          <>
            {hourly ? (
              <fieldset>
                <legend className={fieldLabel}>{t.sheets.log.title}</legend>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <input aria-label={t.sheets.log.hours} className={`form-input block w-full tabular-nums`} inputMode="numeric" placeholder={t.sheets.log.hours} value={h} onChange={(e) => setH(e.target.value.replace(/\D/g, '').slice(0, 2))} />
                  <input aria-label={t.sheets.log.minutes} className={`form-input block w-full tabular-nums`} inputMode="numeric" placeholder={t.sheets.log.minutes} value={m} onChange={(e) => setM(e.target.value.replace(/\D/g, '').slice(0, 2))} />
                </div>
              </fieldset>
            ) : null}
            <label className="mt-4 block">
              <span className={fieldLabel}>{t.sheets.log.note}</span>
              <textarea className={`form-input block w-full mt-2 min-h-24 py-3`} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
            </label>
            {buttons(
              hourly ? fill(t.sheets.log.confirm, { hours: minutes ? hoursText(minutes) : '' }) : t.sheets.log.claim,
              () => api.logHours(v.id, { minutes: minutes ?? 0, note: note.trim(), k }),
              minutes === null,
            )}
          </>
        );
      }
    }
  }
}
