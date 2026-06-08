'use client';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import {
  IntakeShell,
  type ExtractedDeal,
  type DirectPostResult,
} from '@/features/shared/IntakeShell';
import { DirectDealForm } from './DirectDealForm';
import { useGuide } from '@/shared/guide/GuideProvider';

/// Hybrid intake for the Direct Deal create flow. Same direct-post pattern
/// as Brief/Listing. Direct deals are higher stakes (a specific counterparty
/// commits to a specific amount), so the missing-fields gate is stricter:
/// counterparty + amount + deadline + terms must all be present before the
/// shell will post. Anything else (milestone split, trusted toggle) falls
/// back to sensible defaults the user can edit on the deal page.

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function paramsFor(e: ExtractedDeal): URLSearchParams {
  const out = new URLSearchParams();
  if (e.counterpartyHint && ADDR_RE.test(e.counterpartyHint)) {
    out.set('seller', e.counterpartyHint);
  }
  if (e.counterpartyHint && EMAIL_RE.test(e.counterpartyHint)) {
    out.set('sellerEmail', e.counterpartyHint);
  }
  if (e.amountUsdc != null && e.amountUsdc > 0) {
    out.set('amount', String(e.amountUsdc));
  }
  if (e.terms) out.set('terms', e.terms);
  return out;
}

function missingFields(e: ExtractedDeal): string[] {
  const missing: string[] = [];
  const hint = e.counterpartyHint?.trim();
  const hasCounterparty = !!hint && (ADDR_RE.test(hint) || EMAIL_RE.test(hint));
  if (!hasCounterparty) missing.push("the counterparty's wallet or email");
  if (!e.terms || e.terms.trim().length < 8) missing.push('the work description');
  if (e.amountUsdc == null || e.amountUsdc <= 0) missing.push('the amount');
  if (e.deadlineDays == null || e.deadlineDays <= 0) missing.push('the deadline');
  return missing;
}

export function DirectDealComposer() {
  const router = useRouter();
  const { address } = useAuth();
  const { recordAction } = useGuide();

  const directPost = async (e: ExtractedDeal): Promise<DirectPostResult> => {
    if (!address) {
      return { kind: 'error', error: 'Sign in to open a direct deal.' };
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

    const hint = e.counterpartyHint!.trim();
    const isAddress = ADDR_RE.test(hint);
    const firstReleasePct =
      e.suggestedFirstMilestonePct != null
        ? Math.max(10, Math.min(90, Math.round(e.suggestedFirstMilestonePct)))
        : 50;
    const trusted = e.suggestedTrustedMatch === true;

    try {
      const res = await api.createDirectDeal({
        buyerAddress: address,
        sellerAddress: isAddress ? hint : undefined,
        sellerEmail: isAddress ? undefined : hint,
        dealAmountUsdc: e.amountUsdc!,
        deadlineDays: e.deadlineDays!,
        terms: e.terms,
        firstReleasePct,
        requireStake: trusted,
        requireStakePct: trusted ? 50 : undefined,
        /// Honour the LLM's acceptanceWindowHours extraction so "they have
        /// 1 hour to accept" actually configures a 1-hour window instead
        /// of silently defaulting to the backend's 24h. Clamped to the
        /// backend's accepted range; null falls through to the default.
        ...(e.acceptanceWindowHours != null
          ? {
              acceptanceWindowHours: Math.max(
                1,
                Math.min(720, Math.round(e.acceptanceWindowHours)),
              ),
            }
          : {}),
      });
      recordAction('create-direct-deal');
      router.push(`/deals/${res.deal.jobId}`);
      return { kind: 'posted' };
    } catch (err) {
      if (err instanceof ApiError && err.message === 'insufficient buyer balance') {
        return {
          kind: 'review',
          params: paramsFor(e),
          notes: [
            'Your buyer agent wallet does not have enough USDC to fund this escrow. Top it up, then post from the form.',
            ...e.notes,
          ],
        };
      }
      const detail =
        err instanceof ApiError && err.detail
          ? String(err.detail)
          : (err as Error).message ?? 'Could not open the deal.';
      return { kind: 'error', error: detail };
    }
  };

  return (
    <IntakeShell
      surface="direct"
      storageKey="karwan-intake-mode-direct"
      helper="Describe the deal in your own words. Karwan parses it and opens the escrow immediately. You can edit anything from the deal page if it looks off."
      placeholder="Example: 500 USDC to 0x1234...abcd for a landing page redesign, 7 days, 50/50 milestone split, trusted."
      textTooltip="Describe in plain words. Karwan parses your sentence and opens the deal right away."
      formTooltip="Pick each field yourself. No LLM in the path."
      directPost={directPost}
      renderForm={(key) => <DirectDealForm key={key} />}
    />
  );
}
