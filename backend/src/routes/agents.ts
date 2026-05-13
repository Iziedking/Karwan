import { Hono } from 'hono';
import { config } from '../config.js';
import { loadBuyerProfile } from '../agents/buyer-profile.js';
import { loadSellerProfile } from '../agents/seller-profile.js';
import { getBuyerSnapshot } from '../agents/buyer.js';
import { getSellerSnapshot } from '../agents/seller.js';

export const agentsRoutes = new Hono();

agentsRoutes.get('/buyer', (c) => {
  try {
    const { walletId: _wid, ...profile } = loadBuyerProfile();
    return c.json({ profile, ...getBuyerSnapshot() });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

agentsRoutes.get('/seller', (c) => {
  try {
    const { walletId: _wid, ...profile } = loadSellerProfile();
    return c.json({ profile, ...getSellerSnapshot() });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

agentsRoutes.get('/status', (c) =>
  c.json({
    chain: { id: 5042002, rpc: config.ARC_TESTNET_RPC_URL, explorer: config.ARC_TESTNET_EXPLORER_URL },
    contracts: {
      jobBoard: config.KARWAN_JOBBOARD_ADDR,
      escrow: config.KARWAN_ESCROW_ADDR,
      reputation: config.KARWAN_REPUTATION_ADDR,
      usdc: config.USDC_ADDR,
      identityRegistry: config.IDENTITY_REGISTRY_ADDR,
    },
    agents: {
      buyer: { configured: !!config.BUYER_AGENT_WALLET_ID, address: config.BUYER_AGENT_ADDRESS },
      seller: { configured: !!config.SELLER_AGENT_WALLET_ID, address: config.SELLER_AGENT_ADDRESS },
    },
  }),
);
