// Platform fee in basis points, split evenly between buyer and seller.
// Mirrors KarwanEscrow.feeBps for client-side fee previews; the contract is the
// source of truth at funding time.
export const PLATFORM_FEE_BPS = 150;

// Fallback buyer review window if the deal API does not carry reviewWindowMs.
// The backend (config.DEAL_REVIEW_WINDOW_MS) is the source of truth.
export const REVIEW_WINDOW_MS = 5 * 60 * 1000;

// Each "still reviewing" tip adds this much to the final-release window, capped
// at MAX_REVIEW_EXTENSIONS. Mirrors the backend defaults for display.
export const REVIEW_EXTENSION_MS = 10 * 60 * 1000;
export const MAX_REVIEW_EXTENSIONS = 3;

export interface FeeBreakdown {
  dealAmount: number;
  feeTotal: number;
  buyerFee: number;
  sellerFee: number;
  fundedAmount: number;
  sellerNet: number;
}

export function feeBreakdown(dealAmount: number): FeeBreakdown {
  const feeTotal = (dealAmount * PLATFORM_FEE_BPS) / 10000;
  const buyerFee = feeTotal / 2;
  const sellerFee = feeTotal - buyerFee;
  return {
    dealAmount,
    feeTotal,
    buyerFee,
    sellerFee,
    fundedAmount: dealAmount + buyerFee,
    sellerNet: dealAmount - sellerFee,
  };
}
