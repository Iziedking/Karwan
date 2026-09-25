/// The `bridge.minted` payload for a transfer the browser finished through App
/// Kit and then recorded. It names its direction: without it a client cannot
/// tell money that left Arc from money that arrived, and greets an outbound
/// transfer with the arrival sound.
export function recordedBridgeMintedPayload(input: {
  bridgeId: string;
  amountUsdc: string | number;
  mintRecipient: string;
  burnTxHash?: string;
  mintTxHash?: string;
  reference: string;
  movementState: string;
  direction: 'in' | 'out';
}): Record<string, unknown> {
  return {
    bridgeId: input.bridgeId,
    amountUsdc: input.amountUsdc,
    mintRecipient: input.mintRecipient,
    sourceTxHash: input.burnTxHash ?? '',
    ...(input.mintTxHash ? { txHash: input.mintTxHash } : { alreadyMinted: true }),
    reference: input.reference,
    movementState: input.movementState,
    direction: input.direction,
  };
}
