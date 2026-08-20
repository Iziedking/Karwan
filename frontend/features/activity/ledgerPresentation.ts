/// Durable movement references are support-safe identifiers. Keep the complete
/// value visible and copyable instead of reducing it to an ambiguous prefix.
export function ledgerReferenceLabel(refId: string | null | undefined): string | null {
  const value = refId?.trim();
  return value ? value : null;
}

export function ledgerStatusTone(status: 'done' | 'pending' | 'failed'): 'positive' | 'pending' | 'failed' {
  if (status === 'done') return 'positive';
  return status;
}
