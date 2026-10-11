import { config } from '../config.js';
import { isChatAccount } from '../channels/accountsLive.js';
import { levelOf } from '../verification/live.js';
import type { ChatFundingDeps } from './chatDealGate.js';

/// On mainnet a chat account's money is always held to the beta limits; on
/// testnet only when the verified network is switched on.
export const chatFundingDeps: ChatFundingDeps = {
  enabled: config.VERIFIED_NETWORK_ONLY || config.ARC_NETWORK === 'mainnet',
  isChatAccount,
  levelOf: (address) => levelOf(address),
};
