'use client';

import { TaskEntryLink } from '@/shared/components/TaskEntryLink';
import { signInHref } from '@/shared/auth/signInHref';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, type ContestEntryView, type ContestView } from '@/core/api';
import { fill } from '@/features/deals/workspace/presentation';
import { Sheet, fieldLabel, primaryButton, quietButton } from '@/features/deals/workspace/Sheet';
import { photoSrc } from '@/features/listings/photos';
import { Hint } from '@/shared/components/Hint';
import { useAuth } from '@/shared/hooks/useAuth';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { ALERT, CHIP, FIELD, PRIMARY, QUIET } from '@/shared/ui/controls';
import { canMark, contestPhase, contestScreen, microsToUsdc, picksReady } from '../contestModel';
import { StepsTrack } from '@/features/deals/workspace/StepsTrack';
import { contestSteps } from '../contestSteps';
import { useMoneyText } from '@/features/money/hooks/useMoneyText';

const REASON_MAX = 280;
const TAG = 'inline-flex items-center rounded-full border border-[var(--color-critical)] px-2.5 py-0.5 text-[13px] font-semibold text-[var(--lp-dark)]';

/// One contest (views 40 and 88). The prize is the loudest line; a contest
/// that protects its entrants shows its three dates; the buyer picks winners
/// from previews and can mark an entry not valid with a reason every entrant
/// reads; an entrant sends their work or replaces it.
export function ContestPage({ id }: { id: string }) {
  const mt = useMoneyText({ compact: true });
  const t = useTranslations().contests;
  const j = t.judging;
  const { locale } = useLocale();
  const { isAuthenticated } = useAuth();
  const [c, setC] = useState<ContestView | null>(null);
  const [missing, setMissing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [picks, setPicks] = useState<string[]>([]);
  const [sheet, setSheet] = useState<'award' | 'cancel' | 'enter' | 'mark' | null>(null);
  const [award, setAward] = useState<{ netMicros: string[]; backMicros: string } | null>(null);
  const [marking, setMarking] = useState<ContestEntryView | null>(null);
  const [reason, setReason] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.getContest(id).then((v) => { setC(v); setNow(Date.now()); }).catch((err) => { if (err instanceof ApiError && err.status === 404) setMissing(true); });
  }, [id]);
  useEffect(() => {
    load();
    const poll = window.setInterval(load, 10_000);
    return () => window.clearInterval(poll);
  }, [load]);

  if (missing) return <main className="mx-auto max-w-[760px] px-4 pt-8 sm:px-6"><p className="text-[15px] text-[var(--lp-text-sub)]">{t.failed}</p></main>;
  if (!c) return null;

  const date = (ms: number) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(ms);
  const day = (ms: number) => new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(ms);
  const usdc = (m: string) => mt.text(microsToUsdc(m));
  const { next } = contestScreen(c, { signedIn: isAuthenticated, now });
  const phase = contestPhase(c, now);
  const markable = canMark(c, now);
  const shown = (c.entryList ?? []).filter((e) => e.status === 'in' || e.status === 'won' || e.status === 'lost');
  const close = () => { setSheet(null); setError(null); };
  const placeRow = (i: number) => fill(j.placeRow, { place: t.page.places[i]! });
  const winners = c.shares.length === 1 ? t.market.winnersOne : fill(t.market.winnersMany, { n: c.shares.length });

  const run = async (step: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await step();
      close();
      setPicks([]);
      setFiles([]);
      setReason('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.failed);
    } finally {
      setBusy(false);
    }
  };

  const togglePick = (entryId: string) =>
    setPicks((p) => (p.includes(entryId) ? p.filter((x) => x !== entryId) : p.length < c.shares.length ? [...p, entryId] : p));

  async function openAward() {
    setError(null);
    try {
      setAward((await api.contestAwardCard(c!.id, picks)).card);
      setSheet('award');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.failed);
    }
  }

  function openMark(e: ContestEntryView) {
    setMarking(e);
    setReason('');
    setError(null);
    setSheet('mark');
  }

  const readAll = (list: File[]) =>
    Promise.all(list.map((f) => new Promise<string>((ok, no) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result));
      r.onerror = () => no(r.error);
      r.readAsDataURL(f);
    })));

  const left = phase && phase.daysLeft > 0 ? (phase.daysLeft === 1 ? j.left.one : fill(j.left.many, { n: phase.daysLeft })) : '';
  const statusLine = phase ? fill(j.phase[phase.phase], { left }) : t.page.status[c.status];
  // The won place, when exactly one place paid what this entrant won.
  const wonPlace = c.myEntry?.status === 'won' && c.winners
    ? (() => { const at = c.winners.filter((w) => w.netMicros === c.myEntry!.wonMicros); return at.length === 1 ? at[0]!.place - 1 : -1; })()
    : -1;

  const dates: [string, string, string?][] = c.protects && c.status === 'open'
    ? [
      [now < c.entriesBy ? j.dates.entriesClose : j.dates.entriesClosed, day(c.entriesBy)],
      [now < c.awardBy ? j.dates.judgingEnds : j.dates.judgingEnded, day(c.awardBy)],
      phase?.phase === 'waiting'
        ? [j.dates.earliestPaid, day(c.payoutFrom ?? c.awardBy)]
        : [c.mine ? j.dates.ifYouPickNobody : j.dates.ifNobody, fill(j.dates.paidOut, { date: date(c.payoutFrom ?? c.awardBy) }), j.ifNobodyHint],
    ]
    : [];

  return (
    <main className="mx-auto w-full max-w-[760px] px-4 pb-16 pt-8 sm:px-6">
      <p className="text-[14px] font-semibold text-[var(--lp-text-sub)]">{statusLine}</p>
      <h1 className="mt-1 text-[28px] font-semibold text-[var(--lp-dark)]">{c.title}</h1>
      <p className="mt-3 text-[34px] font-semibold tabular-nums text-[var(--lp-dark)]">{mt.fill(t.market.prize, { amount: microsToUsdc(c.prizeMicros) })}</p>
      <p className="mt-1 text-[15px] text-[var(--lp-text-sub)]">
        {c.protects
          ? `${winners} · ${fill(t.market.entries, { n: c.entries })}`
          : `${winners} · ${fill(t.page.closes, { date: date(c.entriesBy) })} · ${fill(t.page.pickBy, { date: date(c.awardBy) })}`}
      </p>
      {dates.length ? (
        <dl data-contest-dates className="mt-5 divide-y divide-[var(--lp-border-light)] rounded-[16px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] px-4 text-[15px]">
          {dates.map(([k, v, hint]) => (
            <div key={k} className="flex justify-between gap-4 py-3">
              <dt className="inline-flex items-center gap-1.5 text-[var(--lp-text-sub)]">{k}{hint ? <Hint side="top">{hint}</Hint> : null}</dt>
              <dd className="font-semibold text-[var(--lp-dark)]">{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div data-steps-card className="mt-6 rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-5">
        <StepsTrack steps={contestSteps(c, now)} />
      </div>

      <section className="mt-8 border-t border-[var(--lp-border-light)] pt-6">
        <h2 className="text-[17px] font-semibold text-[var(--lp-dark)]">{t.page.brief}</h2>
        <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-[var(--lp-dark)]">{c.brief}</p>
      </section>

      {c.winners?.length ? (
        <section data-contest-winners className="mt-8 border-t border-[var(--lp-border-light)] pt-6">
          {wonPlace >= 0 ? (
            <div className="mb-4 rounded-[16px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-4">
              <p className="text-[17px] font-semibold text-[var(--lp-dark)]">{fill(j.youWon, { place: t.page.places[wonPlace]!.toLocaleLowerCase(locale) })}</p>
              <p className="mt-1 text-[15px] text-[var(--lp-text-sub)]">{mt.fill(j.withAgent, { amount: microsToUsdc(c.myEntry!.wonMicros ?? '0') })}</p>
            </div>
          ) : null}
          {c.auto ? (
            <dl className="divide-y divide-[var(--lp-border-light)] text-[15px]">
              {c.winners.map((w) => (
                <div key={w.place} className="flex justify-between gap-4 py-3">
                  <dt className="text-[var(--lp-text-sub)]">{placeRow(w.place - 1)}</dt>
                  <dd className="font-semibold tabular-nums text-[var(--lp-dark)]">{usdc(w.netMicros)}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-[var(--lp-text-sub)]">{j.picked}</dt>
                <dd className="font-semibold text-[var(--lp-dark)]">{j.earliest}</dd>
              </div>
            </dl>
          ) : (
            c.winners.map((w) => (
              <p key={w.place} className="text-[15px] tabular-nums text-[var(--lp-dark)]">{mt.fill(t.page.winner, { amount: microsToUsdc(w.netMicros) }, { place: t.page.places[w.place - 1]! })}</p>
            ))
          )}
        </section>
      ) : null}

      {c.mine ? (
        <section className="mt-8 border-t border-[var(--lp-border-light)] pt-6" aria-labelledby="entries-title">
          <h2 id="entries-title" className="text-[17px] font-semibold text-[var(--lp-dark)]">{next === 'pick' ? t.page.pick : t.page.entries}</h2>
          {next === 'pick' ? <p className="mt-1 text-[14px] text-[var(--lp-text-sub)]">{t.page.pickHint}</p> : null}
          {shown.length === 0 ? <p className="mt-2 text-[15px] text-[var(--lp-text-sub)]">{t.page.noEntries}</p> : (
            <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {shown.map((e) => {
                const place = picks.indexOf(e.id);
                const marked = !!e.notValid;
                return (
                  <li key={e.id} data-entry={e.id} className={marked ? 'opacity-70' : undefined}>
                    <button
                      type="button"
                      disabled={next !== 'pick' || marked}
                      aria-pressed={place >= 0}
                      onClick={() => togglePick(e.id)}
                      className={`w-full overflow-hidden rounded-[16px] border text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${place >= 0 ? 'border-[var(--lp-dark)]' : 'border-[var(--lp-border-light)]'}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photoSrc(e.previewUrl)} alt="" className="aspect-[4/3] w-full bg-[var(--lp-light)] object-cover" />
                      <span className="block p-3">
                        <span className="block text-[15px] font-semibold text-[var(--lp-dark)]">{e.seller}{place >= 0 ? ` · ${t.page.places[place]}` : ''}</span>
                        {marked ? <span className="mt-0.5 block text-[14px] text-[var(--lp-text-sub)]">{e.notValid}</span> : e.note ? <span className="mt-0.5 block text-[14px] text-[var(--lp-text-sub)]">{e.note}</span> : null}
                      </span>
                    </button>
                    {marked ? <span className={`${TAG} mt-2`}>{j.notValid}</span> : null}
                    {!marked && markable && e.status === 'in' ? (
                      <button type="button" onClick={() => openMark(e)} className={`${CHIP} mt-2`}>{j.notValid}</button>
                    ) : null}
                    {e.status === 'won' ? (
                      <span className="mt-2 flex flex-wrap gap-3">
                        {Array.from({ length: e.files }, (_, n) => (
                          <a key={n} href={photoSrc(`/api/contests/${c.id}/entries/${e.id}/files/${n}`)} className={QUIET}>{fill(t.page.file, { n: n + 1 })}</a>
                        ))}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {error && !sheet ? <p role="alert" className={`${ALERT} mt-4`}>{error}</p> : null}
          {next === 'pick' ? (
            <button type="button" disabled={!picksReady(c, picks, now)} onClick={() => void openAward()} className={`${PRIMARY} mt-6 w-full sm:w-auto`}>{t.page.pay}</button>
          ) : null}
          {next === 'take_back' ? <button type="button" onClick={() => setSheet('cancel')} className={`${QUIET} mt-4`}>{t.page.takeBack}</button> : null}
        </section>
      ) : (
        <section className="mt-8 border-t border-[var(--lp-border-light)] pt-6">
          {c.myEntry?.notValid ? (
            <div data-my-entry-marked>
              <h2 className="text-[17px] font-semibold text-[var(--lp-dark)]">{t.page.yours}</h2>
              <p className="mt-2 flex flex-wrap items-center gap-2">
                <span className={TAG}>{j.notValid}</span>
                <span className="text-[14px] text-[var(--lp-text-sub)]">{j.markedBy}</span>
              </p>
              <p className="mt-3 text-[14px] text-[var(--lp-text-sub)]">{j.theirReason}</p>
              <p className="mt-1 text-[15px] text-[var(--lp-dark)]">“{c.myEntry.notValid}”</p>
            </div>
          ) : c.myEntry && wonPlace < 0 ? (
            <>
              <h2 className="text-[17px] font-semibold text-[var(--lp-dark)]">{t.page.yours}</h2>
              <p className="mt-1 text-[15px] text-[var(--lp-dark)]">
                {mt.fill(t.page.yourStatus[c.myEntry.status], { amount: microsToUsdc(c.myEntry.wonMicros ?? '0') })}
              </p>
            </>
          ) : null}
          {next === 'sign_in' ? <TaskEntryLink href={signInHref(`/contests/${encodeURIComponent(c.id)}`)} className={`${PRIMARY} mt-4`}>{t.page.signIn}</TaskEntryLink> : null}
          {next === 'closed' ? <p className="text-[15px] text-[var(--lp-text-sub)]">{t.page.closed}</p> : null}
          {next === 'enter' || next === 'replace' ? (
            <div className="mt-4 space-y-4">
              <label className="block">
                <span className={fieldLabel}>{t.page.files}</span>
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 4))}
                  className="mt-2 block w-full text-[15px] text-[var(--lp-dark)] file:me-3 file:min-h-11 file:rounded-full file:border-0 file:bg-[var(--tint)] file:px-4 file:font-semibold"
                />
                <span className="mt-1 block text-[14px] text-[var(--lp-text-sub)]">{t.page.filesHint}</span>
              </label>
              <label className="block">
                <span className={fieldLabel}>{t.page.note}</span>
                <input className={`${FIELD} mt-2`} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
              </label>
              <button type="button" disabled={files.length === 0} onClick={() => setSheet('enter')} className={`${PRIMARY} w-full sm:w-auto`}>
                {c.myEntry?.notValid ? j.newEntry : next === 'replace' ? t.page.replace : t.page.enter}
              </button>
            </div>
          ) : null}
          {c.marked?.length ? (
            <div data-contest-marked className="mt-8">
              <h2 className="text-[17px] font-semibold text-[var(--lp-dark)]">{j.marked}</h2>
              <dl className="mt-2 divide-y divide-[var(--lp-border-light)] text-[15px]">
                {c.marked.map((m, i) => (
                  <div key={`${m.seller}-${i}`} className="py-3">
                    <dt className="font-semibold text-[var(--lp-dark)]">{m.seller}</dt>
                    <dd className="mt-0.5 text-[var(--lp-text-sub)]">{m.reason}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
        </section>
      )}

      <Sheet open={sheet === 'award'} title={t.award.title} busy={busy} onClose={close}>
        {award ? (
          <>
            <dl className="divide-y divide-[var(--lp-border-light)] border-y border-[var(--lp-border-light)] text-[15px]">
              {picks.map((entryId, i) => (
                <div key={entryId} className="flex justify-between gap-4 py-3">
                  <dt className="text-[var(--lp-text-sub)]">{t.page.places[i]} · {shown.find((e) => e.id === entryId)?.seller}</dt>
                  <dd className="font-semibold tabular-nums text-[var(--lp-dark)]">{usdc(award.netMicros[i] ?? '0')}</dd>
                </div>
              ))}
              {BigInt(award.backMicros) > 0n ? (
                <div className="flex justify-between gap-4 py-3">
                  <dt className="text-[var(--lp-text-sub)]">{t.award.back}</dt>
                  <dd className="font-semibold tabular-nums text-[var(--lp-dark)]">{usdc(award.backMicros)}</dd>
                </div>
              ) : null}
            </dl>
            <p className="mt-4 text-[14px] text-[var(--lp-text-sub)]">{t.award.body}</p>
            {error ? <p role="alert" className={`${ALERT} mt-4`}>{error}</p> : null}
            <div className="mt-6 space-y-3">
              <button type="button" disabled={busy} onClick={() => void run(() => api.awardContest(c.id, picks))} className={primaryButton}>{t.award.confirm}</button>
              <button type="button" disabled={busy} onClick={close} className={quietButton}>{t.notNow}</button>
            </div>
          </>
        ) : null}
      </Sheet>

      <Sheet open={sheet === 'mark'} title={fill(t.mark.title, { name: marking?.seller ?? '' })} busy={busy} onClose={close}>
        {marking ? (
          <>
            <div className="flex items-center gap-3 border-y border-[var(--lp-border-light)] py-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoSrc(marking.previewUrl)} alt="" className="h-12 w-12 rounded-[10px] bg-[var(--lp-light)] object-cover" />
              <span className="text-[15px] font-semibold text-[var(--lp-dark)]">{marking.seller}</span>
            </div>
            <label className="mt-4 block">
              <span className={`${fieldLabel} inline-flex items-center gap-1.5`}>{t.mark.why}<Hint side="bottom">{t.mark.hint}</Hint></span>
              <textarea className={`${FIELD} mt-2 min-h-24 py-3`} value={reason} maxLength={REASON_MAX} onChange={(e) => setReason(e.target.value)} />
              <span className="mt-1 block text-end text-[13px] tabular-nums text-[var(--lp-text-sub)]">{fill(t.mark.count, { n: reason.length })}</span>
            </label>
            {error ? <p role="alert" className={`${ALERT} mt-4`}>{error}</p> : null}
            <div className="mt-6 space-y-3">
              <button type="button" disabled={busy || reason.trim().length < 5} onClick={() => void run(() => api.markContestEntry(c.id, marking.id, reason.trim()))} className={primaryButton}>{t.mark.confirm}</button>
              <button type="button" disabled={busy} onClick={close} className={quietButton}>{t.mark.keep}</button>
            </div>
          </>
        ) : null}
      </Sheet>

      <Sheet open={sheet === 'cancel'} title={t.cancel.title} busy={busy} onClose={close}>
        <p className="text-[15px] text-[var(--lp-dark)]">{t.cancel.body}</p>
        {error ? <p role="alert" className={`${ALERT} mt-4`}>{error}</p> : null}
        <div className="mt-6 space-y-3">
          <button type="button" disabled={busy} onClick={() => void run(() => api.cancelContest(c.id))} className={primaryButton}>{t.cancel.confirm}</button>
          <button type="button" disabled={busy} onClick={close} className={quietButton}>{t.notNow}</button>
        </div>
      </Sheet>

      <Sheet open={sheet === 'enter'} title={t.enterSheet.title} busy={busy} onClose={close}>
        <p className="text-[15px] text-[var(--lp-dark)]">{t.enterSheet.body}</p>
        {error ? <p role="alert" className={`${ALERT} mt-4`}>{error}</p> : null}
        <div className="mt-6 space-y-3">
          <button type="button" disabled={busy} onClick={() => void run(async () => api.enterContest(c.id, { files: await readAll(files), note }))} className={primaryButton}>{t.enterSheet.confirm}</button>
          <button type="button" disabled={busy} onClick={close} className={quietButton}>{t.notNow}</button>
        </div>
      </Sheet>
    </main>
  );
}
