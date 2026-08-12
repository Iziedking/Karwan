export type PoChainLine = {
  financier: string;
  seller: string;
  principalUsdc: bigint;
  repayUsdc: bigint;
  requiredStakeUsdc: bigint;
  state: number;
};

export function assertPoFunded(
  receiptStatus: 'success' | 'reverted',
  receiptFrom: string,
  line: PoChainLine,
  expected: {
    financier: string;
    seller: string;
    principalUsdc: bigint;
    repayUsdc: bigint;
    requiredStakeUsdc: bigint;
  },
): void {
  if (receiptStatus !== 'success') throw new Error('po funding transaction reverted on chain');
  if (receiptFrom.toLowerCase() !== expected.financier.toLowerCase()) {
    throw new Error('po funding sender mismatch');
  }
  if (
    line.financier.toLowerCase() !== expected.financier.toLowerCase() ||
    line.seller.toLowerCase() !== expected.seller.toLowerCase() ||
    line.principalUsdc !== expected.principalUsdc ||
    line.repayUsdc !== expected.repayUsdc ||
    line.requiredStakeUsdc !== expected.requiredStakeUsdc ||
    line.state !== 1
  ) {
    throw new Error('po funding contract state mismatch');
  }
}

export function assertPoTerminal(
  receiptStatus: 'success' | 'reverted',
  state: number,
  expectedState: 2 | 3,
): void {
  if (receiptStatus !== 'success') throw new Error('po terminal transaction reverted on chain');
  if (state !== expectedState) throw new Error('po terminal contract state mismatch');
}
