'use client';
import { IntakeShell, type ExtractedDeal } from '@/features/shared/IntakeShell';
import { DirectDealForm } from './DirectDealForm';

/// Hybrid intake for the Direct Deal create flow. Thin wrapper over the
/// shared IntakeShell that defines the surface-specific URL params and
/// notes mapping. The DirectDealForm itself is unchanged (742 lines) —
/// the shell drives it via existing useSearchParams() reads.

function mapToParams(e: ExtractedDeal, current: URLSearchParams) {
  if (e.counterpartyHint && /^0x[a-fA-F0-9]{40}$/.test(e.counterpartyHint)) {
    current.set('seller', e.counterpartyHint);
  }
  if (e.amountUsdc != null && e.amountUsdc > 0) {
    current.set('amount', String(e.amountUsdc));
  }
  if (e.terms) current.set('terms', e.terms);
  return current;
}

function notesFor(e: ExtractedDeal): string[] {
  const out: string[] = [];
  if (e.deadlineDays != null) {
    out.push(`Suggested deadline: about ${Math.round(e.deadlineDays)} days. Set it on the form.`);
  }
  if (e.suggestedFirstMilestonePct != null) {
    out.push(
      `Suggested milestone split: ${e.suggestedFirstMilestonePct} / ${
        100 - e.suggestedFirstMilestonePct
      }.`,
    );
  }
  if (e.suggestedTrustedMatch === true) {
    out.push('You mentioned wanting a stake-backed deal. Toggle the trusted option.');
  }
  out.push(...e.notes);
  return out;
}

export function DirectDealComposer() {
  return (
    <IntakeShell
      surface="direct"
      storageKey="karwan-intake-mode-direct"
      helper="Describe the deal in your own words. Karwan extracts the structured fields and lets you confirm before posting."
      placeholder="Example: I need a landing page redesign for a Web3 product. Budget 500 USDC, 7 days, 50/50 milestone split. Counterparty 0x1234..."
      mapToParams={mapToParams}
      notesFor={notesFor}
      renderForm={(key) => <DirectDealForm key={key} />}
    />
  );
}
