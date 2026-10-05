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
          ? 'var(--color-critical)'
          : done
            ? 'var(--color-positive)'
            : active
              ? 'var(--ink)'
              : 'var(--ink-secondary)';

        return (
          <li key={key} className="flex items-center gap-2 text-[14px]" aria-current={active ? "step" : undefined}>
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
                  ? 'var(--color-critical)'
                  : done
                    ? 'var(--color-positive)'
                    : active
                      ? 'var(--ink)'
                      : 'var(--line)',
                flexShrink: 0,
              }}
            />
            <span style={{ color: colour }}>
              {labels[key]}
            </span>
            {step?.explorerUrl && (
              <a
                href={step.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-10 items-center rounded-full px-2 text-[14px] text-[var(--ink-secondary)] underline underline-offset-2 hover:text-[var(--ink)] transition-colors duration-[var(--dur-small)] ease-[var(--ease-ui)] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)] font-medium"
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
