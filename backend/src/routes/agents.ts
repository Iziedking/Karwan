import { Hono } from 'hono';
import { config } from '../config.js';
import { getBuyerSnapshot } from '../agents/buyer.js';
import { getSellerSnapshot } from '../agents/seller.js';
import { getAgentWallets } from '../db/agentWallets.js';

export const agentsRoutes = new Hono();

// Managed deals run on per-user agents. With ?address= these endpoints scope the
// snapshot to that user's own agent; without it they return the whole network.

agentsRoutes.get('/buyer', async (c) => {
  const address = c.req.query('address');
  if (!address) return c.json({ profile: null, ...getBuyerSnapshot() });
  const agents = await getAgentWallets(address);
  if (!agents) return c.json({ profile: null, jobs: [] });
  return c.json({ profile: null, ...getBuyerSnapshot(agents.buyerAddress) });
});

agentsRoutes.get('/seller', async (c) => {
  const address = c.req.query('address');
  if (!address) return c.json({ profile: null, ...getSellerSnapshot() });
  const agents = await getAgentWallets(address);
  if (!agents) return c.json({ profile: null, activeBids: [] });
  return c.json({ profile: null, ...getSellerSnapshot(agents.sellerAddress) });
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
    cctpRelay: {
      configured: !!config.cctpRelayWalletId,
      address: config.cctpRelayAddress,
    },
    /// Deprecated: present for backward-compat with frontends pre-rename.
    /// Reads the same resolved value as cctpRelay above. Drop after the
    /// frontend stops reading this field.
    agents: {
      buyer: {
        configured: !!config.cctpRelayWalletId,
        address: config.cctpRelayAddress,
      },
      seller: {
        configured: !!config.SELLER_AGENT_WALLET_ID,
        address: config.SELLER_AGENT_ADDRESS,
      },
    },
  }),
);
