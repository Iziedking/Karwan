'use client';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/// The four steps Gateway reports for a spend, in the order it runs them.
/// Names match the SDK's `gateway.spend.step.*` events exactly, so a step can be
/// looked up by the name the event carries with no translation table.
export const SPEND_STEPS = [
  'buildBurnIntents',
  'signBurnIntents',
  'fetchAttestation',
  'mint',
] as const;

export type SpendStepName = (typeof SPEND_STEPS)[number];

/// What the SDK hands us per step. `state` is its own vocabulary: 'pending' is
/// in-flight, not queued.
export interface GatewayStep {
  state: 'pending' | 'success' | 'error';
  txHash?: string;
  explorerUrl?: string;
}

export type StepMap = Partial<Record<SpendStepName, GatewayStep>>;

/// Live progress for a Gateway spend.
///
/// Until now a move showed "Moving" and then "Moved", with the forwarder's mint
/// happening entirely off-screen after the user's signature. The SDK reports
/// every stage, so show them: what was signed, what is being attested, and where
/// it landed, with an explorer link the moment one exists.
///
/// A step with no entry has not started. The first step with no entry after a
/// finished one is the one we are waiting on, which is what makes the strip feel
/// live without inventing state the SDK did not give us.
export function GatewayProgress({ steps }: { steps: StepMap }) {
  const t = useTranslations().gatewaySteps;

  const labels: Record<SpendStepName, string> = {
    buildBurnIntents: t.build,
    signBurnIntents: t.sign,
    fetchAttestation: t.attest,
    mint: t.land,
  };

  // The step we are waiting on: the first that has not succeeded.
  const nextIndex = SPEND_STEPS.findIndex((k) => steps[k]?.state !== 'success');

  return (
    <ol className="mt-3 flex flex-col gap-1.5">
      {SPEND_STEPS.map((key, i) => {
        const step = steps[key];
        const done = step?.state === 'success';
        const failed = step?.state === 'error';
        const active = !done && !failed && i === nextIndex;
        const colour = failed
          ? '#b03d3a'
          : done
            ? '#0a7553'
            : active
              ? 'var(--lp-dark)'
              : 'var(--lp-text-sub)';

        return (
          <li key={key} className="flex items-center gap-2 text-[12px]">
            <span
              aria-hidden
              className={
                active ? 'motion-safe:animate-pulse motion-reduce:animate-none' : undefined
              }
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: failed
                  ? '#b03d3a'
                  : done
                    ? '#0a7553'
                    : active
                      ? 'var(--lp-accent)'
                      : 'var(--lp-border-light)',
                flexShrink: 0,
              }}
            />
            <span style={{ color: colour, opacity: !done && !active && !failed ? 0.55 : 1 }}>
              {labels[key]}
            </span>
            {step?.explorerUrl && (
              <a
                href={step.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mono text-[10px] uppercase tracking-[0.08em] text-[var(--lp-text-sub)] underline underline-offset-2 hover:text-[var(--lp-dark)] transition-colors"
              >
                {t.view}
              </a>
            )}
          </li>
        );
      })}
    </ol>
  );
}
