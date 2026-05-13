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

import { config } from '../config.js';

export function loadSellerProfile(): SellerProfile {
  if (!config.SELLER_AGENT_WALLET_ID || !config.SELLER_AGENT_ADDRESS) {
    throw new Error('SELLER_AGENT_WALLET_ID and SELLER_AGENT_ADDRESS must be set');
  }
  return {
    walletId: config.SELLER_AGENT_WALLET_ID,
    address: config.SELLER_AGENT_ADDRESS,
    displayName: 'Lagos Frontend Dev',
    skills: ['Next.js', 'React', 'TypeScript', 'Tailwind', 'Web3 UI'],
    bio: 'Frontend dev open to gigs of any size, from a CSS color swap to a full landing-page build.',
    minBudgetUsdc: 1,
    maxBudgetUsdc: 5000,
    minDeadlineDays: 1,
    maxDeadlineDays: 60,
    confidenceThreshold: 0.7,
  };
}
