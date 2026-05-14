export interface BuyerProfile {
  walletId: string;
  address: string;
  displayName: string;
  maxBudgetUsdc: number;
  minDeadlineDays: number;
  maxDeadlineDays: number;
  bidCollectionSeconds: number;
  maxCounterRounds: number;
  confidenceThreshold: number;
  /** Sum must equal 100, length 1..4. KarwanEscrow rejects otherwise. */
  milestonePcts: number[];
}
