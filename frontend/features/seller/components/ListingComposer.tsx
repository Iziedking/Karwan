'use client';
import { IntakeShell, type ExtractedDeal } from '@/features/shared/IntakeShell';
import { PostListingForm } from './PostListingForm';

/// Hybrid intake for the seller's Listing flow. Thin wrapper over
/// IntakeShell. Maps the extracted fields into URL params that
/// PostListingForm reads as its initial state on mount.

function mapToParams(e: ExtractedDeal, current: URLSearchParams) {
  if (e.title) current.set('title', e.title);
  if (e.terms) current.set('description', e.terms);
  if (e.amountUsdc != null && e.amountUsdc > 0) {
    current.set('price', String(e.amountUsdc));
  }
  if (e.tolerancePct != null) {
    current.set('tolerance', String(Math.round(e.tolerancePct)));
  }
  return current;
}

function notesFor(e: ExtractedDeal): string[] {
  const out: string[] = [];
  if (e.deadlineDays != null) {
    out.push(
      `Suggested listing window: about ${Math.round(e.deadlineDays)} days. Set the duration on the form.`,
    );
  }
  out.push(...e.notes);
  return out;
}

export function ListingComposer() {
  return (
    <IntakeShell
      surface="listing"
      storageKey="karwan-intake-mode-listing"
      helper="Describe what you offer in your own words. Karwan extracts the title, ask price, description, and tolerance so buyers can find it."
      placeholder="Example: Solidity audit for ERC-4626 vaults and ERC-8004 escrows. 1500 USDC fixed, 7 days turnaround, plus or minus 20% on price. Listing open for 14 days."
      mapToParams={mapToParams}
      notesFor={notesFor}
      renderForm={(key) => <PostListingForm key={key} />}
    />
  );
}
