'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, type ContestView } from '@/core/api';
import { fill } from '@/features/deals/workspace/presentation';
import { Sheet, fieldLabel, primaryButton, quietButton } from '@/features/deals/workspace/Sheet';
import { photoSrc } from '@/features/listings/photos';
import { useAuth } from '@/shared/hooks/useAuth';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { ALERT, FIELD, PRIMARY, QUIET } from '@/shared/ui/controls';
import { contestScreen, microsToUsdc, picksReady } from '../contestModel';

/// One contest (view 40). The prize is the loudest line; the buyer picks
/// winners from previews; an entrant sends their work or replaces it.
export function ContestPage({ id }: { id: string }) {
  const t = useTranslations().contests;
  const { locale } = useLocale();
  const { isAuthenticated } = useAuth();
  const [c, setC] = useState<ContestView | null>(null);
  const [missing, setMissing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [picks, setPicks] = useState<string[]>([]);
  const [sheet, setSheet] = useState<'award' | 'cancel' | 'enter' | null>(null);
  const [award, setAward] = useState<{ netMicros: string[]; backMicros: string } | null>(null);
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
  const usdc = (m: string) => `${microsToUsdc(m)} USDC`;
  const { next } = contestScreen(c, { signedIn: isAuthenticated, now });
  const shown = (c.entryList ?? []).filter((e) => e.status === 'in' || e.status === 'won' || e.status === 'lost');
  const close = () => { setSheet(null); setError(null); };

  const run = async (step: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await step();
      close();
      setPicks([]);
      setFiles([]);
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

  const readAll = (list: File[]) =>
    Promise.all(list.map((f) => new Promise<string>((ok, no) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result));
      r.onerror = () => no(r.error);
      r.readAsDataURL(f);
    })));

  return (
    <main className="mx-auto w-full max-w-[760px] px-4 pb-16 pt-8 sm:px-6">
      <p className="text-[14px] font-semibold text-[var(--lp-text-sub)]">{t.page.status[c.status]}</p>
      <h1 className="mt-1 text-[28px] font-semibold text-[var(--lp-dark)]">{c.title}</h1>
      <p className="mt-3 text-[34px] font-semibold tabular-nums text-[var(--lp-dark)]">{fill(t.market.prize, { amount: microsToUsdc(c.prizeMicros) })}</p>
      <p className="mt-1 text-[15px] text-[var(--lp-text-sub)]">
        {c.shares.length === 1 ? t.market.winnersOne : fill(t.market.winnersMany, { n: c.shares.length })} · {fill(t.page.closes, { date: date(c.entriesBy) })} · {fill(t.page.pickBy, { date: date(c.awardBy) })}
      </p>

      <section className="mt-8 border-t border-[var(--lp-border-light)] pt-6">
        <h2 className="text-[17px] font-semibold text-[var(--lp-dark)]">{t.page.brief}</h2>
        <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-[var(--lp-dark)]">{c.brief}</p>
      </section>

      {c.winners?.length ? (
        <section className="mt-8 border-t border-[var(--lp-border-light)] pt-6">
          {c.winners.map((w) => (
            <p key={w.place} className="text-[15px] tabular-nums text-[var(--lp-dark)]">{fill(t.page.winner, { place: t.page.places[w.place - 1]!, amount: microsToUsdc(w.netMicros) })}</p>
          ))}
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
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      disabled={next !== 'pick'}
                      aria-pressed={place >= 0}
                      onClick={() => togglePick(e.id)}
                      className={`w-full overflow-hidden rounded-[16px] border text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${place >= 0 ? 'border-[var(--lp-dark)]' : 'border-[var(--lp-border-light)]'}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photoSrc(e.previewUrl)} alt="" className="aspect-[4/3] w-full bg-[var(--lp-light)] object-cover" />
                      <span className="block p-3">
                        <span className="block text-[15px] font-semibold text-[var(--lp-dark)]">{e.seller}{place >= 0 ? ` · ${t.page.places[place]}` : ''}</span>
                        {e.note ? <span className="mt-0.5 block text-[14px] text-[var(--lp-text-sub)]">{e.note}</span> : null}
                      </span>
                    </button>
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
          {c.myEntry ? (
            <>
              <h2 className="text-[17px] font-semibold text-[var(--lp-dark)]">{t.page.yours}</h2>
              <p className="mt-1 text-[15px] text-[var(--lp-dark)]">
                {fill(t.page.yourStatus[c.myEntry.status], { amount: microsToUsdc(c.myEntry.wonMicros ?? '0') })}
              </p>
            </>
          ) : null}
          {next === 'sign_in' ? <Link href={`/start?next=/contests/${c.id}`} className={`${PRIMARY} mt-4`}>{t.page.signIn}</Link> : null}
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
                {next === 'replace' ? t.page.replace : t.page.enter}
              </button>
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
