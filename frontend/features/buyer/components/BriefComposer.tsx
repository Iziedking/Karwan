'use client';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import {
  IntakeShell,
  type ExtractedDeal,
  type DirectPostResult,
} from '@/features/shared/IntakeShell';
import { PostJobForm } from './PostJobForm';
import { sfx } from '@/shared/utils/sfx';
import { useGuide } from '@/shared/guide/GuideProvider';

/// Hybrid intake for the buyer's Brief (managed) flow.
///
/// "Type it out" path: directly posts the brief on Extract. The agent
/// auction starts immediately. If the LLM left required fields blank
/// (budget, deadline, or terms) we fall back to the form with prefilled
/// values and a notes panel asking the user to fill the gaps.
///
/// "Fill the form" path: renders PostJobForm unchanged.

function paramsFor(e: ExtractedDeal): URLSearchParams {
  const out = new URLSearchParams();
  if (e.terms) out.set('brief', e.terms);
  if (e.amountUsdc != null && e.amountUsdc > 0) {
    out.set('budget', String(e.amountUsdc));
  }
  if (e.tolerancePct != null) {
    out.set('tolerance', String(Math.round(e.tolerancePct)));
  }
  if (e.suggestedTrustedMatch === true) {
    out.set('trustedMatch', '1');
  }
  return out;
}

function missingFields(e: ExtractedDeal): string[] {
  const missing: string[] = [];
  if (!e.terms || e.terms.trim().length < 8) missing.push('the work description');
  if (e.amountUsdc == null || e.amountUsdc <= 0) missing.push('the budget');
  if (e.deadlineDays == null || e.deadlineDays <= 0) missing.push('the deadline');
  return missing;
}

export function BriefComposer() {
  const router = useRouter();
  const { address } = useAuth();
  const { recordAction } = useGuide();

  const directPost = async (e: ExtractedDeal): Promise<DirectPostResult> => {
    if (!address) {
      return { kind: 'error', error: 'Sign in to post a request.' };
    }

    const missing = missingFields(e);
    if (missing.length > 0) {
      const notes = [
        `I could not pull ${missing.join(' and ')} from that description. Add ${
          missing.length === 1 ? 'it' : 'them'
        } below and post.`,
        ...e.notes,
      ];
      return { kind: 'review', params: paramsFor(e), notes };
    }

    try {
      const r = await api.postJob({
        posterAddress: address,
        brief: e.terms,
        budgetUsdc: e.amountUsdc!,
        deadlineDays: e.deadlineDays!,
        negotiationMaxIncreasePct:
          e.tolerancePct != null ? Math.round(e.tolerancePct) : undefined,
        trustedMatch: e.suggestedTrustedMatch === true,
      });
      sfx.send();
      recordAction('post-job');
      router.push(`/jobs/${r.jobId}`);
      return { kind: 'posted' };
    } catch (err) {
      // Insufficient balance is recoverable in the form (which surfaces a
      // top-up CTA), so route there instead of dead-ending in text mode.
      if (err instanceof ApiError && err.message === 'insufficient buyer balance') {
        return {
          kind: 'review',
          params: paramsFor(e),
          notes: [
            'Your buyer agent wallet does not have enough USDC for the trust deposit. Top it up, then post from the form.',
            ...e.notes,
          ],
        };
      }
      const detail =
        err instanceof ApiError && err.detail
          ? String(err.detail)
          : (err as Error).message ?? 'Could not post the request.';
      return { kind: 'error', error: detail };
    }
  };

  return (
    <IntakeShell
      surface="brief"
      storageKey="karwan-intake-mode-brief"
      helper="Describe the request in your own words. Karwan parses it and posts immediately. You can edit the deal from the job page if anything looks off."
      placeholder="Example: I need a backend engineer to build an API endpoint. Budget 120 USDC, 2 days, plus or minus 15% on price, prefer a trusted seller."
      textTooltip="Describe in plain words. Karwan parses your sentence and posts the request right away."
      formTooltip="Pick each field yourself. No LLM in the path."
      directPost={directPost}
      renderForm={(key) => <PostJobForm key={key} />}
    />
  );
}
