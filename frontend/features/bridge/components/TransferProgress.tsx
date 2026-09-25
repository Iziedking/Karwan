'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { fill } from '@/features/deals/workspace/presentation';
import {
  TRANSFER_STEPS,
  elapsedParts,
  isTakingLong,
  transferView,
  type Speed,
  type TransferStep,
} from '../routePlan';

const PRIMARY =
  'inline-flex min-h-12 items-center justify-center rounded-[10px] bg-[var(--accent)] px-5 text-[15px] font-semibold text-[var(--accent-ink)] transition-colors duration-200 hover:bg-[var(--lp-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2';
const SECONDARY =
  'inline-flex min-h-12 items-center justify-center rounded-[10px] border border-[var(--lp-outline-strong)] px-5 text-[15px] font-medium text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]';

export interface TransferProgressProps {
  direction: 'in' | 'out';
  /// The network that is not Arc: where the money comes from on the way in,
  /// where it goes on the way out.
  chainName: string;
  signer: 'wallet' | 'account';
  step: TransferStep | 'failed';
  /// Whether the money had left the source before a failure.
  leftSource: boolean;
  startedAt: number;
  speed: Speed;
  onCheckAgain: () => void;
  onTryAgain: () => void;
  onAnother: () => void;
  onDone: () => void;
  /// Whether a notification will come when it lands; only then does the page
  /// say the person can leave and be told.
  notifies?: boolean;
}

/// A cross-chain transfer in four plain steps, with the time it has taken and
/// what usually happens. A wait is never shown as a failure, and a failure says
/// whether anything left the wallet.
export function TransferProgress(props: TransferProgressProps) {
  const t = useTranslations().money.cross;
  const view = transferView(props.step, props.leftSource);
  const settled = view.kind === 'arrived' || view.kind === 'failed';
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (settled) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [settled]);

  const arc = 'Arc';
  const labels: Record<TransferStep, string> = {
    signed: props.signer === 'wallet' ? t.stepSignedWallet : t.stepSignedAccount,
    leaving: fill(t.stepLeaving, { chain: props.direction === 'in' ? props.chainName : arc }),
    arriving: fill(t.stepArriving, { chain: props.direction === 'in' ? arc : props.chainName }),
    arrived: props.direction === 'in' ? t.stepInBalance : fill(t.stepArrivedOn, { chain: props.chainName }),
  };
  const reached =
    view.kind === 'arrived' ? TRANSFER_STEPS.length
      : view.kind === 'stuck' ? TRANSFER_STEPS.indexOf('leaving')
        : view.kind === 'moving' ? TRANSFER_STEPS.indexOf(view.step)
          : -1;
  const { m, s } = elapsedParts(now - props.startedAt);
  const elapsed = m > 0 ? fill(t.elapsedMinutes, { m, s }) : fill(t.elapsedSeconds, { s });
  const slow = view.kind === 'moving' && isTakingLong(props.startedAt, now, props.speed);
  const usually = props.speed === 'seconds' ? t.usuallySeconds : t.usuallyUnderMinute;

  return (
    <section className="space-y-5">
      <ol className="space-y-3">
        {TRANSFER_STEPS.map((step, index) => {
          const done = index < reached;
          const current = index === reached;
          return (
            <li key={step} aria-current={current ? 'step' : undefined} className="flex items-center gap-3">
              <span
                aria-hidden
                className="grid size-6 shrink-0 place-items-center rounded-full border text-[12px]"
                style={{
                  background: done ? 'var(--lp-dark)' : 'transparent',
                  borderColor: done ? 'var(--lp-dark)' : current ? 'var(--accent)' : 'var(--lp-border-light)',
                  color: 'var(--lp-light)',
                }}
              >
                {done ? '✓' : ''}
              </span>
              <span className={done || current ? 'text-[15px] font-semibold text-[var(--lp-dark)]' : 'text-[15px] text-[var(--lp-text-sub)]'}>
                {labels[step]}
              </span>
            </li>
          );
        })}
      </ol>

      <div role="status" aria-live="polite" className="space-y-2 text-[15px] leading-relaxed text-[var(--lp-dark)]">
        {view.kind === 'arrived' ? <p className="font-semibold">{labels.arrived}</p> : null}
        {view.kind === 'stuck' ? (
          <p>{fill(t.stillMoving, { chain: props.direction === 'in' ? props.chainName : arc })}</p>
        ) : null}
        {view.kind === 'failed' ? (
          <p className="border-s-2 border-[var(--color-critical)] ps-3">{t.nothingLeft}</p>
        ) : null}
        {slow ? <p>{t.slow}</p> : null}
      </div>

      {!settled ? (
        <p className="text-[13px] tabular-nums text-[var(--lp-text-sub)]">
          {`${elapsed} · ${usually}${props.notifies === false ? '' : ` ${t.leaveNote}`}`}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {view.kind === 'arrived' ? (
          <>
            <button type="button" onClick={props.onDone} className={PRIMARY}>{t.done}</button>
            <button type="button" onClick={props.onAnother} className={SECONDARY}>{t.another}</button>
          </>
        ) : null}
        {view.kind === 'stuck' ? <button type="button" onClick={props.onCheckAgain} className={PRIMARY}>{t.checkAgain}</button> : null}
        {view.kind === 'failed' ? <button type="button" onClick={props.onTryAgain} className={PRIMARY}>{t.tryAgain}</button> : null}
        {slow ? <button type="button" onClick={props.onCheckAgain} className={SECONDARY}>{t.checkAgain}</button> : null}
      </div>
    </section>
  );
}
