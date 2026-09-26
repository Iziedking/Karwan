'use client';
import { useId, useRef } from 'react';
import Link from 'next/link';
import { ConfirmSheetShell } from '@/shared/components/ConfirmSheetShell';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { fill } from '@/features/deals/workspace/presentation';
import { ALERT, PRIMARY, SECONDARY } from '@/shared/ui/controls';
import type { StartKind, StartPlan, StartStep } from '../startPlan';
import { sheetMode, type RunState } from '../startRun';

function usdc(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

/// The first press, stated before it happens: what the agent will do, whether
/// the agents are set up now, and the exact amount moved to the buyer agent.
/// After the press the steps show in place, each with its own honest state.
export function StartSheet({
  open,
  onClose,
  kind,
  lead,
  plan,
  run,
  closable,
  onBegin,
  onCheckAgain,
  onTryAgain,
}: {
  open: boolean;
  onClose: () => void;
  kind: StartKind;
  lead: string;
  plan: StartPlan;
  run: RunState | null;
  /// False while a step is mid-flight; a waiting step leaves the sheet closable.
  closable: boolean;
  onBegin: () => void;
  onCheckAgain: () => void;
  onTryAgain: () => void;
}) {
  const t = useTranslations().search.sheet;
  const titleId = useId();
  const primaryRef = useRef<HTMLButtonElement | null>(null);
  const ready = plan.kind === 'ready' ? plan : null;
  const setup = ready?.steps.includes('setup') ?? false;
  const move = ready?.moveUsdc ?? null;
  const label =
    kind === 'offer'
      ? setup
        ? t.setupPost
        : t.post
      : setup && move
        ? fill(t.setupMoveStart, { amount: usdc(move) })
        : move
          ? fill(t.moveStart, { amount: usdc(move) })
          : setup
            ? t.setupStart
            : t.start;
  const stepLabel = (step: StartStep) =>
    step === 'setup'
      ? t.steps.setup
      : step === 'move'
        ? fill(t.steps.move, { amount: usdc(move ?? 0) })
        : kind === 'offer'
          ? t.steps.postOffer
          : t.steps.post;
  const mode = sheetMode(plan, run);
  const moved = run?.steps.some((s) => s.step === 'move' && s.status === 'done') ?? false;

  return (
    <ConfirmSheetShell open={open} labelledBy={titleId} busy={!closable} onClose={onClose} initialFocus={primaryRef}>
      <div className="flex items-start justify-between gap-4">
        <h2 id={titleId} className="text-[20px] font-semibold text-[var(--lp-dark)]">
          {kind === 'offer' ? t.offerTitle : t.requestTitle}
        </h2>
        <button
          type="button"
          onClick={onClose}
          disabled={!closable}
          aria-label={t.close}
          className="-me-2 -mt-2 inline-grid size-11 shrink-0 place-items-center rounded-full text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <span aria-hidden className="text-[22px] leading-none">×</span>
        </button>
      </div>

      <div className="mt-5 space-y-3 text-[15px] leading-relaxed text-[var(--lp-dark)]">
        <p className="break-words">{lead}</p>
        {setup ? <p className="text-[var(--lp-text-sub)]">{t.setupLine}</p> : null}
        {move ? <p className="text-[var(--lp-text-sub)]">{fill(t.moveLine, { amount: usdc(move) })}</p> : null}
      </div>

      {run ? (
        <ol aria-live="polite" className="mt-6 divide-y divide-[var(--lp-border-light)] border-y border-[var(--lp-border-light)]">
          {run.steps.map((s) => (
            <li key={s.step} className="flex min-h-12 items-center justify-between gap-4 py-2 text-[14px]">
              <span className="text-[var(--lp-dark)]">{stepLabel(s.step)}</span>
              <span
                className={
                  s.status === 'failed'
                    ? 'border-s-2 border-[var(--color-critical)] ps-2 font-semibold text-[var(--lp-dark)]'
                    : 'text-[var(--lp-text-sub)]'
                }
              >
                {t.status[s.status]}
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      <div className="mt-6 flex flex-col gap-3">
        {mode === 'loading' ? (
          <p aria-busy="true" className="text-[14px] text-[var(--lp-text-sub)]">{t.loading}</p>
        ) : mode === 'needsProfile' ? (
          <>
            <p className="text-[15px] text-[var(--lp-dark)]">{t.needsProfile}</p>
            <Link href="/start?mode=signup" className={PRIMARY}>{t.finishProfile}</Link>
          </>
        ) : mode === 'needsMoney' && plan.kind === 'needsMoney' ? (
          <>
            <p className="text-[15px] text-[var(--lp-dark)]">{fill(t.needsMoney, { amount: usdc(plan.shortfall) })}</p>
            <Link href="/bridge?intent=add" className={PRIMARY}>{t.addMoney}</Link>
          </>
        ) : mode === 'begin' ? (
          <button ref={primaryRef} type="button" className={PRIMARY} onClick={onBegin}>{label}</button>
        ) : mode === 'checkAgain' ? (
          <button type="button" className={SECONDARY} onClick={onCheckAgain}>{t.checkAgain}</button>
        ) : mode === 'tryAgain' ? (
          <>
            <p role="alert" className={ALERT}>
              {t.notPosted}
              {moved && move ? ` ${fill(t.movedStays, { amount: usdc(move) })}` : ''}
            </p>
            <button type="button" className={SECONDARY} onClick={onTryAgain}>{t.tryAgain}</button>
          </>
        ) : null}
      </div>
    </ConfirmSheetShell>
  );
}
