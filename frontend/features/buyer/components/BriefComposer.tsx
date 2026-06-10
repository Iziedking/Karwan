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

/// Convert the LLM's deadlineDays (which can come back as a fraction like
/// 0.083 for "2 hours") into the right `postJob` payload. The backend
/// accepts deadlineSeconds OR deadlineDays; fractional days fail the
/// integer schema, so any value below 1 day gets rounded up via the
/// seconds path. Integer days >= 1 go through deadlineDays unchanged.
function deadlinePayload(deadlineDays: number): { deadlineSeconds: number } | { deadlineDays: number } {
  if (Number.isInteger(deadlineDays) && deadlineDays >= 1) {
    return { deadlineDays };
  }
  // Sub-day or fractional. Convert to seconds, round UP so "2 hours"
  // doesn't slip below the user's actual ask.
  const seconds = Math.max(60, Math.ceil(deadlineDays * 86_400));
  return { deadlineSeconds: seconds };
}

/// Turn a backend Zod error array (or any error detail shape) into a one-
/// line message the user can act on. Without this, the UI dumped the raw
/// JSON array, readable to engineers, hostile to users.
function humanizeError(raw: unknown): string {
  if (typeof raw === 'string') {
    // Sometimes the backend stringifies the array before we see it.
    const trimmed = raw.trim();
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        return humanizeError(JSON.parse(trimmed));
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }
  if (Array.isArray(raw)) {
    const friendly = raw
      .map((issue: { path?: unknown[]; message?: string }) => {
        const field = Array.isArray(issue.path) ? issue.path.join('.') : '';
        const fieldLabel = field === 'deadlineDays'
          ? 'Deadline'
          : field === 'budgetUsdc'
            ? 'Budget'
            : field === 'brief'
              ? 'Description'
              : field || 'Input';
        const msg = issue.message ?? 'is not valid';
        return `${fieldLabel}: ${msg.replace(/^Expected /, 'expected ')}`;
      })
      .filter(Boolean);
    if (friendly.length === 0) return 'That post needs a small fix. Switch to the form and tweak it.';
    return friendly.join(' · ');
  }
  if (raw && typeof raw === 'object' && 'message' in raw) {
    return String((raw as { message: unknown }).message);
  }
  return 'Could not post the request.';
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
        ...deadlinePayload(e.deadlineDays!),
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
      // Humanize the error rather than dumping a raw Zod array. Most
      // schema mismatches (e.g. fractional deadlineDays from LLM) are
      // recoverable in the form, so route there with the original notes.
      const friendly =
        err instanceof ApiError
          ? humanizeError(err.detail ?? err.message)
          : humanizeError((err as Error).message ?? 'Could not post the request.');
      if (err instanceof ApiError && Array.isArray(err.detail)) {
        // Schema validation failure. Drop into the form so the user can
        // tweak the offending field with the friendly message as a note.
        return {
          kind: 'review',
          params: paramsFor(e),
          notes: [friendly, ...e.notes],
        };
      }
      return { kind: 'error', error: friendly };
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
