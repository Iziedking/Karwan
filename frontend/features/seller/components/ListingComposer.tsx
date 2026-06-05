'use client';
import { api, ApiError } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import {
  IntakeShell,
  type ExtractedDeal,
  type DirectPostResult,
} from '@/features/shared/IntakeShell';
import { PostListingForm } from './PostListingForm';
import { useGuide } from '@/shared/guide/GuideProvider';

/// Hybrid intake for the seller's Listing flow. Same direct-post pattern as
/// BriefComposer: on Extract, post immediately and let the seller edit from
/// the listing page if anything looks off. Falls back to the form when the
/// LLM left required fields blank.

function paramsFor(e: ExtractedDeal): URLSearchParams {
  const out = new URLSearchParams();
  if (e.title) out.set('title', e.title);
  if (e.terms) out.set('description', e.terms);
  if (e.amountUsdc != null && e.amountUsdc > 0) out.set('price', String(e.amountUsdc));
  if (e.tolerancePct != null) out.set('tolerance', String(Math.round(e.tolerancePct)));
  return out;
}

function missingFields(e: ExtractedDeal): string[] {
  const missing: string[] = [];
  if (!e.title || e.title.trim().length < 3) missing.push('a short title');
  if (!e.terms || e.terms.trim().length < 8) missing.push('a description');
  if (e.amountUsdc == null || e.amountUsdc <= 0) missing.push('the ask price');
  return missing;
}

export function ListingComposer() {
  const { address } = useAuth();
  const { recordAction } = useGuide();

  const directPost = async (e: ExtractedDeal): Promise<DirectPostResult> => {
    if (!address) {
      return { kind: 'error', error: 'Sign in to post an offer.' };
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
      await api.postListing({
        sellerUser: address,
        title: e.title!.trim(),
        description: e.terms.trim(),
        askingPriceUsdc: e.amountUsdc!,
        negotiationMaxDecreasePct:
          e.tolerancePct != null ? Math.round(e.tolerancePct) : undefined,
        ttlDays: e.deadlineDays != null && e.deadlineDays > 0 ? e.deadlineDays : undefined,
      });
      recordAction('post-listing');
      // Listings don't have a per-listing detail page that auto-opens after
      // create on this surface — staying on /seller surfaces it under the
      // seller's recent listings band.
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
      return { kind: 'posted' };
    } catch (err) {
      const detail =
        err instanceof ApiError && err.detail
          ? String(err.detail)
          : (err as Error).message ?? 'Could not post the offer.';
      return { kind: 'error', error: detail };
    }
  };

  return (
    <IntakeShell
      surface="listing"
      storageKey="karwan-intake-mode-listing"
      helper="Describe what you offer in your own words. Karwan parses it and posts immediately. You can edit the offer from your seller page if anything looks off."
      placeholder="Example: Solidity audit for ERC-4626 vaults. 1500 USDC fixed, 7 days turnaround, plus or minus 20% on price, listing open for 14 days."
      textTooltip="Describe in plain words. Karwan parses your sentence and posts the offer right away."
      formTooltip="Pick each field yourself. No LLM in the path."
      directPost={directPost}
      renderForm={(key) => <PostListingForm key={key} />}
    />
  );
}
