'use client';
import { useState } from 'react';
import { api, type DealDisputeView, type DisputeStatementView } from '@/core/api';
import { Hint } from '@/shared/components/Hint';
import { Icon } from '@/shared/components/Icon';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { fill, formatDealDate } from './presentation';
import { problemSteps } from './problemSteps';
import { StepsTrack } from './StepsTrack';
import { linksFrom, proposalNote, splitShares } from './disputeShares';
import { useMoneyText } from '@/features/money/hooks/useMoneyText';

/// The open problem on the deal page (owner, 7 Nov 2026, Figma 205:637): one
/// card with a heading and an (i), the route with a date under each stop, the
/// money held, then each side. Once answers close it stops asking.
export function DisputePanel({ jobId, dispute, viewerIsBuyer, caller, name, myName, openedBy = null, openedAt = null, heldUsdc = null, onChanged }: {
  jobId: string;
  dispute: DealDisputeView;
  /// Who opened the problem, when the deal says.
  openedBy?: 'buyer' | 'seller' | null;
  /// When it was opened, ms.
  openedAt?: number | null;
  /// What Karwan still holds while it is decided.
  heldUsdc?: string | null;
  viewerIsBuyer: boolean;
  caller: string;
  /// The other party's display name.
  name: string;
  /// How the viewer is named in a split line ("to you" reads oddly in a share).
  myName: string;
  onChanged: () => void;
}) {
  const mt = useMoneyText({ compact: true });
  const t = useTranslations().disputeJudge;
  const pp = useTranslations().profilePage;
  const { locale } = useLocale();
  const me = viewerIsBuyer ? 'buyer' : 'seller';
  const them = viewerIsBuyer ? 'seller' : 'buyer';
  const mine = dispute.statements[me];
  const theirs = dispute.statements[them];
  const proposal = dispute.proposal;
  const [editing, setEditing] = useState(!mine);
  const track = problemSteps(dispute, Date.now());
  const date = formatDealDate(dispute.closesAt, locale);
  const asking = !proposal && dispute.open && !track.answerPassed;
  const labels: Record<'opened' | 'answer' | 'decides', { label: string; sub?: string }> = {
    opened: {
      label: openedBy === me ? pp.problemOpened : openedBy === them ? fill(pp.theyOpened, { name }) : t.stepOpened,
      sub: openedAt ? formatDealDate(openedAt, locale) : undefined,
    },
    answer: track.answerPassed
      ? { label: t.answersClosed, sub: date }
      : dispute.otherSubmitted && mine
        ? { label: t.answered }
        : { label: t.answersDue, sub: fill(t.dueBy, { date }) },
    decides: { label: pp.karwanDecides },
  };
  // D13 as built: a silent seller's rule returns the money after a Karwan reviewer confirms it.
  const silent = viewerIsBuyer && asking && !dispute.otherSubmitted;
  const theyMissed = !proposal && track.answerPassed && !theirs;

  return (
    <section aria-labelledby="dispute-title" data-problem-card className="mt-6 space-y-4 rounded-[20px] border border-[var(--line)] bg-[var(--lp-card)] p-5">
      <div className="flex items-center gap-2">
        <h2 id="dispute-title" className="text-[18px] font-bold text-[var(--lp-dark)]">
          {asking && editing ? t.title : t.openTitle}
        </h2>
        <Hint side="bottom">{t.intro}</Hint>
      </div>
      <div data-problem-steps className="space-y-3">
        <StepsTrack steps={track.steps.map((step) => ({ ...step, ...labels[step.key] }))} />
        {heldUsdc ? (
          <p data-problem-held className="rounded-[14px] border border-[var(--soft-green-edge)] bg-[var(--soft-green)] px-3.5 py-3 text-[14px] font-semibold text-[var(--ink)]">
            {mt.fill(pp.heldUntil, { amount: heldUsdc })}
          </p>
        ) : null}
        {silent ? <p className="text-[14px] text-[var(--lp-text-sub)]">{fill(pp.silentLine, { name, date })}</p> : null}
      </div>
      {theyMissed ? <p className="text-[15px] font-medium leading-relaxed text-[var(--lp-text-sub)]">{fill(t.closedSilent, { name })}</p> : null}
      {proposal ? <Proposal proposal={proposal} viewerIsBuyer={viewerIsBuyer} name={name} myName={myName} /> : null}

      {asking && editing ? (
        <StatementForm
          jobId={jobId}
          caller={caller}
          viewerIsBuyer={viewerIsBuyer}
          initial={mine}
          onSent={() => { setEditing(false); onChanged(); }}
        />
      ) : mine ? (
        <StatementCard
          title={t.yourAccount}
          statement={mine}
          viewerIsBuyer={viewerIsBuyer}
          action={asking ? { label: t.edit, onClick: () => setEditing(true) } : undefined}
        />
      ) : null}

      {theirs ? (
        <StatementCard title={fill(t.theirAccount, { name })} statement={theirs} viewerIsBuyer={!viewerIsBuyer} />
      ) : theyMissed ? (
        <div data-their-side="silent" className="rounded-[16px] border border-dashed border-[var(--line-strong)] px-4 py-3.5">
          <h3 className="text-[15px] font-bold text-[var(--lp-dark)]">{fill(t.theirAccount, { name })}</h3>
          <p className="mt-0.5 text-[14px] font-medium text-[var(--lp-text-sub)]">{fill(t.didNotAnswer, { date })}</p>
        </div>
      ) : !proposal ? (
        <p className="text-[14px] font-medium text-[var(--lp-text-sub)]">
          {dispute.otherSubmitted ? fill(t.theyGave, { name }) : fill(t.waitingFor, { name })}
        </p>
      ) : null}

      {!proposal && mine && dispute.otherSubmitted && theirs ? (
        <p className="text-[14px] font-medium text-[var(--lp-text-sub)]">{t.reviewing}</p>
      ) : null}

      <p data-dispute-safety className="flex gap-2 text-[13px] font-medium leading-snug text-[var(--lp-text-sub)]">
        <Icon name="shield-check" size={16} className="mt-px shrink-0" />
        <span>{t.safety}</span>
      </p>
    </section>
  );
}

function Proposal({ proposal, viewerIsBuyer, name, myName }: {
  proposal: NonNullable<DealDisputeView['proposal']>;
  viewerIsBuyer: boolean;
  name: string;
  myName: string;
}) {
  const t = useTranslations().disputeJudge;
  const note = proposalNote(proposal);
  const shares = splitShares(proposal.sellerBps);
  const sellerName = viewerIsBuyer ? name : myName;
  const buyerName = viewerIsBuyer ? myName : name;
  const showSplit = proposal.confidence === 'clear' || !!proposal.rule && proposal.rule !== 'both-silent' && proposal.rule !== 'judge-unavailable';
  return (
    <div role="status">
      <h3 className="text-[17px] font-bold text-[var(--lp-dark)]">{t.proposalTitle}</h3>
      {showSplit ? (
        <p className="mt-2 text-[16px] font-semibold tabular-nums text-[var(--lp-dark)]">
          {fill(t.split, { pct: shares.seller, name: sellerName })} · {fill(t.split, { pct: shares.buyer, name: buyerName })}
        </p>
      ) : null}
      {note ? <p className="mt-2 text-[15px] leading-relaxed text-[var(--lp-dark)]">{t[note]}</p> : null}
      {proposal.summary ? <p dir="auto" className="mt-2 text-[15px] leading-relaxed text-[var(--lp-dark)]">{proposal.summary}</p> : null}
      {proposal.items.length ? (
        <ul className="mt-3 divide-y divide-[var(--lp-border-light)] border-y border-[var(--lp-border-light)]">
          {proposal.items.map((it, i) => (
            <li key={i} className="flex items-start justify-between gap-3 py-2.5">
              <span dir="auto" className="min-w-0 text-[15px] text-[var(--lp-dark)]">{it.item}</span>
              <span className="shrink-0 text-[14px] font-semibold text-[var(--lp-text-sub)]">{t.findings[it.finding]}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-3 text-[14px] font-medium text-[var(--lp-text-sub)]">{t.reviewerNote}</p>
    </div>
  );
}

function StatementCard({ title, statement, viewerIsBuyer, action }: {
  title: string;
  statement: DisputeStatementView;
  /// Whose questions these answers belong to.
  viewerIsBuyer: boolean;
  action?: { label: string; onClick: () => void };
}) {
  const t = useTranslations().disputeJudge;
  const { locale } = useLocale();
  const rows: Array<[string, string]> = [
    [viewerIsBuyer ? t.receivedBuyer : t.receivedSeller, statement.received],
    [t.missing, statement.missing],
    [t.late, statement.late],
  ];
  return (
    <div data-statement className="rounded-[16px] bg-[var(--raised)] p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-bold text-[var(--lp-dark)]">{title}</h3>
        {action ? (
          <button type="button" onClick={action.onClick} className="min-h-11 px-2 text-[14px] font-semibold text-[var(--lp-dark)] underline underline-offset-4">
            {action.label}
          </button>
        ) : statement.submittedAt ? (
          <span className="text-[13px] font-medium text-[var(--ink-muted)]">{fill(t.sentOn, { date: formatDealDate(statement.submittedAt, locale) })}</span>
        ) : null}
      </div>
      <dl className="mt-2 space-y-2.5">
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
    </div>
  );
}

function StatementForm({ jobId, caller, viewerIsBuyer, initial, onSent }: {
  jobId: string;
  caller: string;
  viewerIsBuyer: boolean;
  initial?: DisputeStatementView;
  onSent: () => void;
}) {
  const t = useTranslations().disputeJudge;
  const [received, setReceived] = useState(initial?.received ?? '');
  const [missing, setMissing] = useState(initial?.missing ?? '');
  const [late, setLate] = useState(initial?.late ?? '');
  const [links, setLinks] = useState((initial?.links ?? []).join('\n'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = received.trim() && missing.trim() && late.trim();

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await api.submitDisputeStatement(jobId, caller, { received: received.trim(), missing: missing.trim(), late: late.trim(), links: linksFrom(links) });
      onSent();
    } catch {
      setError(t.failed);
    } finally {
      setBusy(false);
    }
  }

  const field = 'mt-1.5 w-full rounded-[14px] border border-[var(--lp-border-light)] bg-[var(--lp-light)] px-3.5 py-3 text-[15px] text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]';
  const label = 'block text-[15px] font-semibold text-[var(--lp-dark)]';
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => { e.preventDefault(); if (ready && !busy) void send(); }}
    >
      <label className={label}>
        {viewerIsBuyer ? t.receivedBuyer : t.receivedSeller}
        <textarea dir="auto" rows={3} maxLength={1000} value={received} onChange={(e) => setReceived(e.target.value)} className={field} />
      </label>
      <label className={label}>
        {t.missing}
        <textarea dir="auto" rows={3} maxLength={1000} value={missing} onChange={(e) => setMissing(e.target.value)} className={field} />
      </label>
      <label className={label}>
        {t.late}
        <textarea dir="auto" rows={2} maxLength={500} value={late} onChange={(e) => setLate(e.target.value)} className={field} />
      </label>
      <label className={label}>
        {t.links}
        <span className="block text-[14px] font-medium text-[var(--lp-text-sub)]">{t.linksHint}</span>
        <textarea rows={2} value={links} onChange={(e) => setLinks(e.target.value)} className={field} />
      </label>
      {error ? <p role="alert" className="text-[14px] font-medium text-[var(--color-critical)]">{error}</p> : null}
      <button
        type="submit"
        disabled={!ready || busy}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[var(--action)] px-6 text-[16px] font-semibold text-[var(--on-action)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)] focus-visible:ring-offset-2"
      >
        {busy ? t.sending : initial ? t.update : t.send}
      </button>
    </form>
  );
}
