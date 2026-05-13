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
    displayName: 'Lagos Frontend Dev — v0',
    skills: ['next.js', 'react', 'typescript', 'tailwind', 'landing-page', 'web3-ui'],
    bio: 'Builds production-grade Next.js landing pages and dApp frontends. 4 years shipping for MEASA SMEs and small SaaS founders.',
    minBudgetUsdc: 5,
    maxBudgetUsdc: 5000,
    minDeadlineDays: 2,
    maxDeadlineDays: 30,
    confidenceThreshold: 0.7,
  };
}
