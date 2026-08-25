/**
 * Select the one advance transaction a factoring acceptance is allowed to
 * reconcile. A persisted hash wins on retry; a newly submitted hash is only
 * accepted when it agrees with that persisted transaction.
 */
export function selectFactoringAdvanceTxHash(input: {
  persistedHash?: string;
  submittedHash?: string;
}): string | undefined {
  const persisted = input.persistedHash?.trim();
  const submitted = input.submittedHash?.trim();
  if (persisted && submitted && persisted.toLowerCase() !== submitted.toLowerCase()) {
    throw new Error('factoring advance transaction changed during reconciliation');
  }
  return persisted ?? submitted;
}
