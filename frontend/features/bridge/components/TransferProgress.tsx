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
  'inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--action)] px-5 text-[15px] font-medium text-[var(--on-action)] transition-opacity duration-[var(--dur-small)] ease-[var(--ease-ui)] motion-reduce:transition-none hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]';
const SECONDARY =
  'inline-flex min-h-10 items-center justify-center rounded-full bg-[var(--tint)] px-4 text-[14px] font-medium text-[var(--ink)] transition-colors duration-[var(--dur-small)] ease-[var(--ease-ui)] motion-reduce:transition-none hover:bg-[var(--line)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]';

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
                className="grid size-6 shrink-0 place-items-center rounded-full text-[13px] font-medium tabular-nums"
                style={{
                  background: done || current ? 'var(--ink)' : 'var(--tint)',
                  color: done || current ? 'var(--canvas)' : 'var(--ink-secondary)',
                }}
              >
                {index + 1}
              </span>
              <span className={done || current ? 'text-[15px] font-medium text-[var(--ink)]' : 'text-[15px] text-[var(--ink-secondary)]'}>
                {labels[step]}
              </span>
            </li>
          );
        })}
      </ol>

      <div role="status" aria-live="polite" className="space-y-2 text-[15px] leading-relaxed text-[var(--ink)]">
        {view.kind === 'arrived' ? <p className="font-medium text-[var(--color-positive)]">{labels.arrived}</p> : null}
        {view.kind === 'stuck' ? (
          <p>{fill(t.stillMoving, { chain: props.direction === 'in' ? props.chainName : arc })}</p>
        ) : null}
        {view.kind === 'failed' ? (
          <p className="text-[var(--color-critical)]">{t.nothingLeft}</p>
        ) : null}
        {slow ? <p>{t.slow}</p> : null}
      </div>

      {!settled ? (
        <p className="text-[13px] tabular-nums text-[var(--ink-secondary)]">
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
