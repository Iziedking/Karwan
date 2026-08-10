export function assertFactoringAssignment(
  receiptStatus: 'success' | 'reverted',
  payee: string,
  financier: string,
): void {
  if (receiptStatus !== 'success') {
    throw new Error('factoring assignment reverted on chain');
  }
  if (payee.toLowerCase() !== financier.toLowerCase()) {
    throw new Error(
      'factoring assignment payee mismatch: expected ' +
        financier +
        ', got ' +
        payee,
    );
  }
}
