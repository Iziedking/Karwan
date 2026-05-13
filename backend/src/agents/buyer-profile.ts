import { config } from '../config.js';

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

export function loadBuyerProfile(): BuyerProfile {
  if (!config.BUYER_AGENT_WALLET_ID || !config.BUYER_AGENT_ADDRESS) {
    throw new Error('BUYER_AGENT_WALLET_ID and BUYER_AGENT_ADDRESS must be set');
  }
  return {
    walletId: config.BUYER_AGENT_WALLET_ID,
    address: config.BUYER_AGENT_ADDRESS,
    displayName: 'Dubai SaaS Buyer',
    maxBudgetUsdc: 5000,
    minDeadlineDays: 2,
    maxDeadlineDays: 30,
    bidCollectionSeconds: 30,
    maxCounterRounds: 2,
    confidenceThreshold: 0.7,
    milestonePcts: [50, 50],
  };
}
