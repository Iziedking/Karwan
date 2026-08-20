export type BridgeHistoryDirection = 'in' | 'out';

/**
 * Completed transfer copy must follow the money, not the technical phase.
 * A CCTP bridge uses the same `done` phase for both directions, while users
 * need to know whether funds arrived or left their Arc balance.
 */
export function completedBridgeLabel(input: {
  phase: string;
  direction?: BridgeHistoryDirection;
  receivedLabel: string;
  sentLabel: string;
}): string {
  if (input.phase !== 'done') return input.receivedLabel;
  return input.direction === 'out' ? input.sentLabel : input.receivedLabel;
}
