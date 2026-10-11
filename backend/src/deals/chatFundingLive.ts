import { config } from '../config.js';
import { findWhatsappAccountByAddress } from '../db/whatsapp.js';
import { levelOf } from '../verification/live.js';
import type { ChatFundingDeps } from './chatDealGate.js';

/// On mainnet a chat account's money is always held to the beta limits; on
/// testnet only when the verified network is switched on.
export const chatFundingDeps: ChatFundingDeps = {
  enabled: config.VERIFIED_NETWORK_ONLY || config.ARC_NETWORK === 'mainnet',
  isChatAccount: async (address) => (await findWhatsappAccountByAddress(address)) !== null,
  levelOf: (address) => levelOf(address),
};
