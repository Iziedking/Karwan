'use client';
import { useState, type ReactNode } from 'react';
import { api, type DealDisputeView, type DisputeHearingView, type DisputeStatementView } from '@/core/api';
import { Hint } from '@/shared/components/Hint';
import { Icon } from '@/shared/components/Icon';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { cn } from '@/shared/utils/cn';
import { useMoneyText } from '@/features/money/hooks/useMoneyText';
import { ConfirmSheet } from './ConfirmSheet';
import { splitShares } from './disputeShares';
import { elapsed, hearingSteps, outcome, timeLeft, type HearingRow } from './hearingSteps';
import { fill, formatDealDate } from './presentation';

/// The problem card while an escrow family dispute is heard (view 90, owner
/// 19 Nov 2026, Figma 375:570), in the deal page's own style: the money held,
/// the steps down a rail with the current one lifted into a panel that shows
/// how long it has, then what each side said, folded.
export function HearingCard({ jobId, dispute, hearing, viewerIsBuyer, caller, name, myName, openedBy, openedAt, heldUsdc, form, onChanged }: {
  jobId: string;
  dispute: DealDisputeView;
  hearing: DisputeHearingView;
  viewerIsBuyer: boolean;
  caller: string;
  name: string;
  myName: string;
  openedBy: 'buyer' | 'seller' | null;
  openedAt: number | null;
  heldUsdc: string | null;
  /// The answer form, while the viewer still owes or is editing an answer.
  form: ReactNode;
  onChanged: () => void;
}) {
  const t = useTranslations().disputeJudge;
  const h = t.hearing;
  const mt = useMoneyText({ compact: true });
  const { locale } = useLocale();
  const now = Date.now();
  const date = (ms: number) => formatDealDate(ms, locale);
  const me = viewerIsBuyer ? 'buyer' : 'seller';
  const them = viewerIsBuyer ? 'seller' : 'buyer';
  const mine = dispute.statements[me];
  const theirs = dispute.statements[them];
  const finding = dispute.proposal;
  const { rows, countdown } = hearingSteps(hearing, openedAt);
  const bothAnsweredAt = mine?.submittedAt && theirs?.submittedAt ? Math.max(mine.submittedAt, theirs.submittedAt) : null;

  const found = finding ? foundLine(finding.sellerBps) : null;
  function foundLine(sellerBps: number): string {
    const o = outcome(sellerBps, viewerIsBuyer);
    if (o !== 'split') return fill(h[o], { name });
    const shares = splitShares(sellerBps);
    return `${fill(t.split, { pct: shares.seller, name: viewerIsBuyer ? name : myName })} · ${fill(t.split, { pct: shares.buyer, name: viewerIsBuyer ? myName : name })}`;
  }

  const label = (row: HearingRow): { label: string; sub?: string } => {
    switch (row.key) {
      case 'opened':
        return {
          label: h.opened,
          sub: openedAt ? fill(openedBy === me ? h.openedYou : h.openedBy, { name, date: date(openedAt) }) : undefined,
        };
      case 'answers':
        return row.state === 'done'
          ? { label: h.answered, sub: bothAnsweredAt ? date(bothAnsweredAt) : date(hearing.answersBy) }
          : { label: h.answer };
      case 'finding':
        if (row.state === 'upcoming') return { label: h.finding, sub: h.findingNext };
        if (row.state === 'current') return { label: h.finding };
        if (hearing.step === 'object') return { label: h.finding, sub: finding?.reviewedAt ? fill(h.checked, { date: date(finding.reviewedAt) }) : undefined };
        return { label: h.finding, sub: found ? (finding?.reviewedAt ? `${found} · ${date(finding.reviewedAt)}` : found) : undefined };
      case 'object':
        return row.state === 'upcoming' ? { label: h.object, sub: h.objectNext } : { label: h.object };
      case 'asked':
        return { label: h.asked, sub: hearing.askedAt ? date(hearing.askedAt) : undefined };
      case 'people':
        return { label: h.people };
      case 'paid':
        return hearing.step === 'people'
          ? { label: h.paidAsDecided }
          : { label: h.paid, sub: hearing.objectBy ? date(hearing.objectBy) : undefined };
    }
  };

  const bar = countdown ? (
    <Countdown
      value={elapsed(countdown, now)}
      text={
        hearing.step === 'answers'
          ? mine ? fill(h.theyCanAnswer, { name, date: date(hearing.answersBy) }) : fill(h.youCanAnswer, { date: date(hearing.answersBy) })
          : hearing.step === 'finding'
            ? fill(h.dueBy, { date: date(hearing.findingBy) })
            : hearing.step === 'object'
              ? leftText(countdown.to)
              : fill(h.decidedBy, { date: date(countdown.to) })
      }
    />
  ) : null;
  function leftText(to: number): string {
    const left = timeLeft(to, now);
    if ('hours' in left) return fill(h.hoursLeft, { n: String(left.hours) });
    return left.days === 1 ? h.dayLeft : fill(h.daysLeft, { n: String(left.days) });
  }

  const panel: ReactNode =
    hearing.step === 'answers' ? (
      <>
        <p className="text-[14px] font-medium text-[var(--lp-dark)]">
          {mine?.submittedAt ? fill(h.youAnswered, { date: date(mine.submittedAt) }) : h.youToAnswer}
        </p>
        {bar}
        <p className="text-[14px] text-[var(--lp-text-sub)]">{h.beforeBoth}</p>
      </>
    ) : hearing.step === 'finding' ? (
      <>
        <p className="text-[14px] font-medium text-[var(--lp-dark)]">{h.reading}</p>
        {bar}
      </>
    ) : hearing.step === 'object' ? (
      <ObjectPanel
        jobId={jobId}
        caller={caller}
        found={found}
        reason={finding?.summary ?? null}
        bar={bar}
        canAsk={hearing.objectBy !== null && now < hearing.objectBy}
        onChanged={onChanged}
      />
    ) : (
      <>
        <p className="text-[14px] font-medium text-[var(--lp-dark)]">{h.peopleLine}</p>
        {bar}
      </>
    );

  return (
    <section aria-labelledby="dispute-title" data-problem-card data-hearing={hearing.step} className="mt-6 space-y-5 rounded-[24px] bg-[var(--lp-card)] p-5">
      <div className="flex items-center gap-2">
        <h2 id="dispute-title" className="text-[18px] font-bold text-[var(--lp-dark)]">{t.openTitle}</h2>
        <Hint side="bottom">{t.intro}</Hint>
      </div>
      {heldUsdc ? (
        <p data-problem-held className="flex items-center gap-2.5 rounded-[14px] bg-[color-mix(in_srgb,var(--lp-accent)_24%,transparent)] px-3.5 py-3 text-[14px] font-semibold text-[var(--lp-dark)]">
          <Icon name="lock" size={16} className="shrink-0" />
          <span>{mt.fill(h.held, { amount: heldUsdc })}</span>
        </p>
      ) : null}

      <ol data-problem-steps aria-label={t.openTitle} className="flex flex-col">
        {rows.map((row, i) => {
          const { label: text, sub } = label(row);
          const last = i === rows.length - 1;
          return (
            <li key={row.key} data-step={row.key} aria-current={row.state === 'current' ? 'step' : undefined} className="grid grid-cols-[24px_minmax(0,1fr)] gap-x-3">
              <span aria-hidden className="flex flex-col items-center">
                <span className={cn('w-0.5', i === 0 ? 'h-0' : 'h-1', row.state === 'upcoming' ? 'bg-[var(--lp-border-light)]' : 'bg-[var(--lp-dark)]')} />
                <Node state={row.state} />
                {last ? null : <span className={cn('w-0.5 flex-1', row.state === 'done' ? 'bg-[var(--lp-dark)]' : 'bg-[var(--lp-border-light)]')} />}
              </span>
              <div className={cn('min-w-0', last ? 'pb-0' : 'pb-4', i === 0 ? 'pt-0.5' : 'pt-1.5')}>
                <p className={cn('text-[15px] leading-snug', row.state === 'upcoming' ? 'text-[var(--lp-text-sub)]' : 'font-semibold text-[var(--lp-dark)]')}>{text}</p>
                {sub ? <p className="mt-0.5 text-[13px] font-medium text-[var(--lp-text-sub)]">{sub}</p> : null}
                {row.state === 'current' ? (
                  <div data-step-panel className="mt-2.5 space-y-3 rounded-[16px] bg-[var(--raised)] p-4 ring-1 ring-[color-mix(in_srgb,var(--lp-accent)_55%,transparent)]">
                    {panel}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {form}

      <div className="space-y-2">
        <h3 className="text-[15px] font-bold text-[var(--lp-dark)]">{h.sides}</h3>
        <SideRow
          title={t.yourAccount}
          statement={mine}
          sub={mine?.submittedAt ? fill(t.sentOn, { date: date(mine.submittedAt) }) : fill(h.canAnswerUntil, { date: date(hearing.answersBy) })}
          viewerIsBuyer={viewerIsBuyer}
        />
        <SideRow
          title={fill(t.theirAccount, { name })}
          statement={theirs}
          sub={
            theirs?.submittedAt ? fill(t.sentOn, { date: date(theirs.submittedAt) })
              : dispute.otherSubmitted ? fill(t.theyGave, { name })
                : hearing.step === 'answers' ? fill(h.canAnswerUntil, { date: date(hearing.answersBy) })
                  : h.noAnswer
          }
          viewerIsBuyer={!viewerIsBuyer}
        />
      </div>

      <p data-dispute-safety className="flex gap-2 text-[13px] font-medium leading-snug text-[var(--lp-text-sub)]">
        <Icon name="shield-check" size={16} className="mt-px shrink-0" />
        <span>{t.safety}</span>
      </p>
    </section>
  );
}

function Node({ state }: { state: HearingRow['state'] }) {
  if (state === 'done') {
    return (
      <span data-node="done" className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--lp-dark)] text-[var(--lp-light)]">
        <Icon name="check" size={16} className="size-3.5" />
      </span>
    );
  }
  if (state === 'current') {
    return (
      <span data-node="current" className="grid size-6 shrink-0 place-items-center rounded-full border-2 border-[var(--lp-accent)] bg-[var(--raised)] shadow-[0_0_0_5px_color-mix(in_srgb,var(--lp-accent)_22%,transparent)]">
        <span className="size-2 rounded-full bg-[var(--lp-accent)]" />
      </span>
    );
  }
  return <span data-node="upcoming" className="size-6 shrink-0 rounded-full border-2 border-dashed border-[var(--line-strong)]" />;
}

function Countdown({ value, text }: { value: number; text: string }) {
  return (
    <div data-countdown>
      <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-[var(--lp-border-light)]">
        <div className="h-full rounded-full bg-[var(--lp-accent)]" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
      <p className="mt-1.5 text-[13px] font-semibold text-[var(--lp-dark)]">{text}</p>
    </div>
  );
}

function ObjectPanel({ jobId, caller, found, reason, bar, canAsk, onChanged }: {
  jobId: string;
  caller: string;
  found: string | null;
  reason: string | null;
  bar: ReactNode;
  canAsk: boolean;
  onChanged: () => void;
}) {
  const h = useTranslations().disputeJudge.hearing;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask() {
    setBusy(true);
    setError(null);
    try {
      await api.escalateDealDispute(jobId, caller);
      setOpen(false);
      onChanged();
    } catch {
      setError(h.askFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div role="status" data-finding>
        <p className="text-[13px] font-medium text-[var(--lp-text-sub)]">{h.found}</p>
        {found ? <p className="mt-0.5 text-[17px] font-bold text-[var(--lp-dark)]">{found}</p> : null}
        {reason ? <p dir="auto" className="mt-1.5 text-[14px] leading-relaxed text-[var(--lp-dark)]">{reason}</p> : null}
      </div>
      {bar}
      {canAsk ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[var(--lp-outline-strong)] px-5 text-[15px] font-semibold text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
        >
          {h.ask}
        </button>
      ) : null}
      <ConfirmSheet
        open={open}
        title={h.askTitle}
        consequence={h.askConsequence}
        irreversible
        busy={busy}
        error={error}
        confirmLabel={h.ask}
        onConfirm={() => { void ask(); }}
        onClose={() => { setOpen(false); setError(null); }}
      />
    </>
  );
}

function SideRow({ title, statement, sub, viewerIsBuyer }: {
  title: string;
  statement: DisputeStatementView | undefined;
  sub: string;
  viewerIsBuyer: boolean;
}) {
  const t = useTranslations().disputeJudge;
  const head = (
    <span className="min-w-0">
      <span className="block text-[15px] font-semibold text-[var(--lp-dark)]">{title}</span>
      <span className="mt-0.5 block text-[13px] font-medium text-[var(--lp-text-sub)]">{sub}</span>
    </span>
  );
  if (!statement) {
    return <div data-side="empty" className="rounded-[16px] border border-dashed border-[var(--line-strong)] px-4 py-3">{head}</div>;
  }
  const rows: Array<[string, string]> = [
    [viewerIsBuyer ? t.receivedBuyer : t.receivedSeller, statement.received],
    [t.missing, statement.missing],
    [t.late, statement.late],
  ];
  return (
    <details data-statement className="group rounded-[16px] bg-[var(--raised)]">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        {head}
        <Icon name="chevron-right" size={16} className="shrink-0 text-[var(--lp-text-sub)] transition-transform group-open:rotate-90 rtl:-scale-x-100" />
      </summary>
      <dl className="space-y-2.5 px-4 pb-4">
        {rows.map(([q, a]) => (
          <div key={q}>
            <dt className="text-[14px] font-medium text-[var(--lp-text-sub)]">{q}</dt>
            <dd dir="auto" className="mt-0.5 whitespace-pre-line text-[15px] font-semibold text-[var(--lp-dark)]">{a}</dd>
          </div>
        ))}
        {statement.links.length ? (
          <div>
            <dt className="text-[14px] font-medium text-[var(--lp-text-sub)]">{t.links}</dt>
            <dd className="mt-0.5 space-y-1">
              {statement.links.map((href) => (
                <a key={href} href={href} target="_blank" rel="noreferrer noopener" className="block truncate text-[15px] font-semibold text-[var(--lp-dark)] underline underline-offset-4">{href}</a>
              ))}
            </dd>
          </div>
        ) : null}
      </dl>
    </details>
  );
}
