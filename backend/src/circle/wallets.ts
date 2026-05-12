import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import { config } from '../config.js';

let _client: ReturnType<typeof initiateDeveloperControlledWalletsClient> | null = null;

export function circleWalletsClient() {
  if (_client) return _client;
  if (!config.CIRCLE_API_KEY || !config.CIRCLE_ENTITY_SECRET) {
    throw new Error('CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET are required');
  }
  _client = initiateDeveloperControlledWalletsClient({
    apiKey: config.CIRCLE_API_KEY,
    entitySecret: config.CIRCLE_ENTITY_SECRET,
  });
  return _client;
}

export const ARC_TESTNET_BLOCKCHAIN = 'ARC-TESTNET' as const;
