export interface SellerProfile {
  walletId: string;
  address: string;
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
