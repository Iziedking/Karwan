export interface SellerProfile {
  walletId: string;
  address: string;
  /// Owner (identity) address behind the agent. Tier state and deal history
  /// live on the owner, so sweep ordering reads it, not the agent wallet.
  userAddress: string;
  displayName: string;
  skills: string[];
  bio: string;
  minBudgetUsdc: number;
  maxBudgetUsdc: number;
  minDeadlineDays: number;
  maxDeadlineDays: number;
  confidenceThreshold: number;
  /** Canonical match tags extracted from skills+bio at profile-save time.
   *  Used to gate bidding when the brief is in an unrelated topic. */
  keywords: string[];
}
