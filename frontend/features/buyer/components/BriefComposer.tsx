'use client';
import { IntakeShell, type ExtractedDeal } from '@/features/shared/IntakeShell';
import { PostJobForm } from './PostJobForm';

/// Hybrid intake for the buyer's Brief (managed) flow. Thin wrapper over
/// IntakeShell. Maps the extracted fields into URL params that PostJobForm
/// reads as its initial state on mount.

function mapToParams(e: ExtractedDeal, current: URLSearchParams) {
  if (e.terms) current.set('brief', e.terms);
  if (e.amountUsdc != null && e.amountUsdc > 0) {
    current.set('budget', String(e.amountUsdc));
  }
  if (e.tolerancePct != null) {
    current.set('tolerance', String(Math.round(e.tolerancePct)));
  }
  if (e.suggestedTrustedMatch === true) {
    current.set('trustedMatch', '1');
  }
  return current;
}

function notesFor(e: ExtractedDeal): string[] {
  const out: string[] = [];
  if (e.deadlineDays != null) {
    out.push(`Suggested deadline: about ${Math.round(e.deadlineDays)} days. Set it on the form.`);
  }
  if (e.suggestedTrustedMatch === false) {
    out.push('You opted out of trusted match. The form starts with that off.');
  }
  out.push(...e.notes);
  return out;
}

export function BriefComposer() {
  return (
    <IntakeShell
      surface="brief"
      storageKey="karwan-intake-mode-brief"
      helper="Describe the request in your own words. Karwan extracts the budget cap, deadline, and negotiation tolerance for the agent auction."
      placeholder="Example: Need a Solidity audit for a 500-line lending contract. Budget 2000 USDC, 10 days, plus or minus 15%, prefer trusted sellers."
      mapToParams={mapToParams}
      notesFor={notesFor}
      renderForm={(key) => <PostJobForm key={key} />}
    />
  );
}
