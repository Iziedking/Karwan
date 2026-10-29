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
  /// Kept for readers that predate the ways; the agent no longer treats it as a cap (view 41).
  maxBudgetUsdc: number;
  /// What the person usually charges, the opening anchor (view 41, phase 2). Unset on
  /// accounts that never set a price, which anchor on the budget.
  usualPriceUsdc?: number;
  /// The floor and the usual price are per item (a goods way, view 41).
  pricesPerItem?: boolean;
  /// Under this the agent says no politely instead of asking (view 41, decision 3).
  noAskBelowUsdc?: number;
  minDeadlineDays: number;
  maxDeadlineDays: number;
  confidenceThreshold: number;
  /** Canonical match tags extracted from skills+bio at profile-save time.
   *  Used to gate bidding when the brief is in an unrelated topic. */
  keywords: string[];
  /** 'ask' suggests a fitting request to the owner instead of bidding (view 19). */
  agentMode?: 'offers' | 'ask' | 'agree';
  /** Saved ways to sell (view 26). Absent when the person never saved any. */
  ways?: import('./ways.js').SellWay[];
  /** Existing issuer records carried into read-only matching snapshots. */
  skillVerifications?: Array<{
    skillId: string;
    status: 'pending' | 'verified' | 'rejected' | 'expired' | 'revoked';
    issuer: string;
    expiresAt?: number;
  }>;
}
