'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, type WorkView, type WorkWeekView } from '@/core/api';
import { fill } from '@/features/deals/workspace/presentation';
import { Sheet, fieldLabel, primaryButton, quietButton } from '@/features/deals/workspace/Sheet';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { ALERT, FIELD, PRIMARY, QUIET } from '@/shared/ui/controls';
import { hoursText, localDay, microsToUsdc, minutesFrom, weekLine, workActions } from '../workModel';

type SheetKind =
  | { kind: 'accept' | 'decline' | 'takeBack' | 'fund' | 'notice' }
  | { kind: 'log'; k: number }
  | { kind: 'approve'; w: WorkWeekView }
  | { kind: 'object'; w: WorkWeekView };

/// One piece of hourly work (view 32), the same page for both sides. The
/// rate and this week's hours lead; each money step opens the confirm sheet.
export function WorkPage({ id }: { id: string }) {
  const t = useTranslations().work;
  const { locale } = useLocale();
  const [v, setV] = useState<WorkView | null>(null);
  const [missing, setMissing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [h, setH] = useState('');
  const [m, setM] = useState('');
  const [note, setNote] = useState('');
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

  if (missing) return <main className="mx-auto max-w-[760px] px-4 pt-8 sm:px-6"><p className="text-[15px] text-[var(--lp-text-sub)]">{t.failed}</p></main>;
  if (!v) return null;

  const hourly = v.kind === 'hourly';
  const usdc = (micros: string) => `${microsToUsdc(micros)} USDC`;
  const day = (ms: number) => localDay(ms, locale);
  const periodName = (k: number) => fill(hourly ? t.page.week : t.page.month, { n: k + 1 });
  const close = () => { setSheet(null); setError(null); setH(''); setM(''); setNote(''); };
  const run = async (step: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await step();
      close();
      load();
    } catch (err) {
      const need = err instanceof ApiError ? (err.body as { needMicros?: string } | undefined)?.needMicros : undefined;
      setError(need ? fill(t.card.short, { amount: microsToUsdc(need) }) : err instanceof ApiError ? err.message : t.failed);
    } finally {
      setBusy(false);
    }
  };
  const minutes = hourly ? minutesFrom(h, m) : 1;
  const actions = workActions(v);
  const other = v.role === 'hirer' ? fill(t.page.hiring, { name: v.workerName }) : fill(t.page.hiredBy, { name: v.hirerName });
  const lastK = v.runs - 1;
  // One primary button on the screen: the newest week's step if it has one,
  // else the first step on the work as a whole.
  const primaryWeek = [...v.weeks].reverse().find((w) => w.canLog || w.canApprove)?.k ?? null;

  return (
    <main className="mx-auto w-full max-w-[760px] px-4 pb-16 pt-8 sm:px-6">
      <p className="text-[14px] font-semibold text-[var(--lp-text-sub)]">{t.page.status[v.status]}</p>
      <h1 dir="auto" className="mt-1 text-[28px] font-semibold text-[var(--lp-dark)]">{v.title}</h1>
      <p className="mt-1 text-[15px] text-[var(--lp-text-sub)]">{other}</p>
      <p className="mt-5 text-[32px] font-semibold tabular-nums text-[var(--lp-dark)]">
        {fill(hourly ? t.page.rateHour : t.page.rateMonth, { amount: microsToUsdc(v.rateMicros) })}
      </p>
      <p className="mt-1 text-[15px] text-[var(--lp-text-sub)]">
        {[hourly ? fill(t.page.upTo, { n: v.maxHours }) : null, fill(hourly ? t.page.weeks : t.page.months, { n: v.runs }), fill(t.page.starts, { date: day(v.startsAt) })].filter(Boolean).join(' · ')}
      </p>
      {v.status === 'ending' ? <p className="mt-1 text-[15px] font-semibold text-[var(--lp-dark)]">{fill(hourly ? t.page.endsAfterWeek : t.page.endsAfterMonth, { n: lastK + 1 })}</p> : null}
      {v.brief ? <p dir="auto" className="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-[var(--lp-dark)]">{v.brief}</p> : null}

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
              <button key={a} type="button" onClick={() => setSheet({ kind: a })} className={primaryWeek === null && i === 0 && a !== 'notice' ? PRIMARY : QUIET}>
                {label}
              </button>
            );
          })}
        </div>
      ) : null}
      {v.role === 'hirer' && v.fundBlocked && (v.status === 'active' || v.status === 'ending') && v.weeks.length < v.runs ? (
        <p className="mt-3 text-[14px] text-[var(--lp-text-sub)]">{v.fundBlocked}</p>
      ) : null}

      <ul className="mt-8 divide-y divide-[var(--lp-border-light)] border-y border-[var(--lp-border-light)]">
        {[...v.weeks].reverse().map((w) => {
          const line = weekLine(w, now);
          const status =
            line === 'settled'
              ? [w.paidNetMicros && BigInt(w.paidNetMicros) > 0n ? fill(t.page.paid, { amount: microsToUsdc(w.paidNetMicros) }) : null, w.backMicros && BigInt(w.backMicros) > 0n ? fill(t.page.back, { amount: microsToUsdc(w.backMicros) }) : null].filter(Boolean).join(' · ')
              : line === 'with-review' ? t.page.withReview
              : line === 'in-review' ? fill(t.page.reviewBy, { date: day(w.reviewBy) })
              : line === 'logging' ? fill(t.page.logBy, { date: day(w.logBy) })
              : fill(t.page.starts, { date: day(w.start) });
          return (
            <li key={w.k} className="py-4">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-[17px] font-semibold text-[var(--lp-dark)]">{periodName(w.k)}</span>
                <span className="text-[15px] font-semibold tabular-nums text-[var(--lp-dark)]">
                  {hourly
                    ? (w.loggedMinutes ? fill(t.page.logged, { hours: hoursText(w.loggedMinutes), most: hoursText(v.maxHours * 60) }) : t.page.nothingLogged)
                    : (w.loggedMinutes ? t.page.claimed : t.page.nothingLogged)}
                </span>
              </div>
              <p className="mt-1 text-[14px] text-[var(--lp-text-sub)]">{status}</p>
              {w.log.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {w.log.filter((x) => x.note).map((x) => (
                    <li key={x.at} dir="auto" className="text-[14px] text-[var(--lp-text-sub)]">{hourly ? `${hoursText(x.minutes)} · ` : ''}{x.note}</li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-3">
                {w.canLog ? <button type="button" onClick={() => setSheet({ kind: 'log', k: w.k })} className={primaryWeek === w.k ? PRIMARY : QUIET}>{hourly ? t.page.logHours : t.page.claimMonth}</button> : null}
                {w.canApprove ? (
                  <button type="button" onClick={() => setSheet({ kind: 'approve', w })} className={primaryWeek === w.k ? PRIMARY : QUIET}>
                    {hourly ? fill(t.page.approve, { hours: hoursText(w.loggedMinutes) }) : t.page.approveMonth}
                  </button>
                ) : null}
                {w.canObject ? <button type="button" onClick={() => setSheet({ kind: 'object', w })} className={QUIET}>{t.page.wrong}</button> : null}
              </div>
            </li>
          );
        })}
        {v.weeks.length < v.runs && (v.status === 'active' || v.status === 'ending') ? (
          <li className="py-4">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-[17px] font-semibold text-[var(--lp-dark)]">{periodName(v.weeks.length)}</span>
              <span className="text-[15px] text-[var(--lp-text-sub)]">{t.page.notFunded}</span>
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
      case 'log': return hourly ? t.sheets.log.title : t.sheets.log.claim;
      case 'approve': return t.sheets.approve.title;
      case 'object': return t.sheets.object.title;
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
    const body = (text: string) => <p className="text-[15px] leading-relaxed text-[var(--lp-dark)]">{text}</p>;
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
            <p className="text-[32px] font-semibold tabular-nums text-[var(--lp-dark)]">{usdc(v.nextWeek?.totalMicros ?? '0')}</p>
            <p className="mt-2 text-[15px] text-[var(--lp-text-sub)]">{t.sheets.fund.body}</p>
            {buttons(fill(t.sheets.fund.confirm, { amount: microsToUsdc(v.nextWeek?.totalMicros ?? '0') }), () => api.fundWork(v.id))}
          </>
        );
      case 'approve':
        return (
          <>
            <p className="text-[32px] font-semibold tabular-nums text-[var(--lp-dark)]">{usdc(sheet.w.ifPaid.netMicros)}</p>
            <p className="mt-1 text-[15px] text-[var(--lp-text-sub)]">{t.sheets.approve.gets}</p>
            <p className="mt-4 text-[15px] text-[var(--lp-dark)]">{t.sheets.approve.body}</p>
            {buttons(t.sheets.approve.confirm, () => api.approveHours(v.id, sheet.w.k))}
          </>
        );
      case 'object': {
        const most = sheet.w.loggedMinutes - sheet.w.approvedMinutes;
        const ok = minutes !== null && minutes <= most && note.trim().length > 0;
        return (
          <>
            <p className="text-[15px] leading-relaxed text-[var(--lp-dark)]">{t.sheets.object.body}</p>
            <fieldset className="mt-4">
              <legend className={fieldLabel}>{t.sheets.object.hours}</legend>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <input aria-label={t.sheets.log.hours} className={`${FIELD} tabular-nums`} inputMode="numeric" placeholder={t.sheets.log.hours} value={h} onChange={(e) => setH(e.target.value.replace(/\D/g, '').slice(0, 2))} />
                <input aria-label={t.sheets.log.minutes} className={`${FIELD} tabular-nums`} inputMode="numeric" placeholder={t.sheets.log.minutes} value={m} onChange={(e) => setM(e.target.value.replace(/\D/g, '').slice(0, 2))} />
              </div>
            </fieldset>
            <label className="mt-4 block">
              <span className={fieldLabel}>{t.sheets.object.why}</span>
              <textarea className={`${FIELD} mt-2 min-h-24 py-3`} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
            </label>
            {buttons(t.sheets.object.confirm, () => api.objectHours(v.id, { k: sheet.w.k, minutes: minutes ?? 0, reason: note.trim() }), !ok)}
          </>
        );
      }
      case 'log': {
        const k = sheet.k;
        return (
          <>
            {hourly ? (
              <fieldset>
                <legend className={fieldLabel}>{t.sheets.log.title}</legend>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <input aria-label={t.sheets.log.hours} className={`${FIELD} tabular-nums`} inputMode="numeric" placeholder={t.sheets.log.hours} value={h} onChange={(e) => setH(e.target.value.replace(/\D/g, '').slice(0, 2))} />
                  <input aria-label={t.sheets.log.minutes} className={`${FIELD} tabular-nums`} inputMode="numeric" placeholder={t.sheets.log.minutes} value={m} onChange={(e) => setM(e.target.value.replace(/\D/g, '').slice(0, 2))} />
                </div>
              </fieldset>
            ) : null}
            <label className="mt-4 block">
              <span className={fieldLabel}>{t.sheets.log.note}</span>
              <textarea className={`${FIELD} mt-2 min-h-24 py-3`} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
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
