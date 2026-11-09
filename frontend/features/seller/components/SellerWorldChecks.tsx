'use client';
import type { SellerWorldCheck } from '@/core/api';
import { AgentWorldCheck } from '@/features/jobs/components/AgentWorldCheck';
import { fill } from '@/features/deals/workspace/presentation';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/// The buyers who chose this seller and wait on the seller's World ID check.
/// The message that asks for it links here (#world-checks), so it shows on
/// /seller whichever version of the page is on.
export function SellerWorldChecks({ checks, me, onDone }: { checks: SellerWorldCheck[]; me: string; onDone: () => void }) {
  const copy = useTranslations().agentNudges;
  if (checks.length === 0 || !me) return null;
  return (
    <section id="world-checks" aria-labelledby="world-checks-title" className="scroll-mt-20 space-y-3">
      <h2 id="world-checks-title" className="text-[17px] font-semibold text-[var(--lp-dark)]">{copy.world.sellerTitle}</h2>
      <ul className="space-y-3">
        {checks.map((w) => (
          <li key={w.jobId} className="space-y-2">
            <p className="text-[15px] text-[var(--lp-dark)]">
              {fill(copy.world.sellerLine, { title: w.title ?? copy.aRequest, amount: w.priceUsdc })}
            </p>
            <AgentWorldCheck jobId={w.jobId} caller={me} role="seller" reason={w.reason} skipAllowed={w.skipAllowed} onDone={onDone} />
          </li>
        ))}
      </ul>
    </section>
  );
}
