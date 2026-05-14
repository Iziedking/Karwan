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
}
