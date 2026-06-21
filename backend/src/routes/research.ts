import { Hono } from 'hono';
import { formatUnits } from 'viem';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { viewerAddress } from '../auth/session.js';
import { getAgentWallets } from '../db/agentWallets.js';
import { readUsdcBalance } from '../chain/contracts.js';
import { executeContractCall } from '../chain/txs.js';
import { bus } from '../events.js';
import {
  RESEARCH_ACTIVATION_USDC,
  activateResearch,
  getResearchState,
} from '../x402/researchAccount.js';

/// "Agent research" activation. The user pays a one-time fee in USDC on Arc
/// from their agent wallet; it becomes a prepaid credit the agent draws down as
/// it pays for live market research (x402, off-platform). UI copy never says
/// "x402"; it frames this as the agent paying for its own research.
export const researchRoutes = new Hono();

const USDC_DECIMALS = 6;

researchRoutes.get('/status', async (c) => {
  const owner = viewerAddress(c);
  if (!owner) return c.json({ active: false, creditUsdc: 0, priceUsdc: RESEARCH_ACTIVATION_USDC });
  const state = await getResearchState(owner);
  return c.json({ ...state, priceUsdc: RESEARCH_ACTIVATION_USDC });
});

researchRoutes.post('/activate', async (c) => {
  const owner = viewerAddress(c);
  if (!owner) return c.json({ error: 'sign in first' }, 401);
  if (!config.KARWAN_TREASURY_ADDR) return c.json({ error: 'research not configured' }, 503);

  const wallets = await getAgentWallets(owner).catch(() => null);
  if (!wallets?.buyerWalletId || !wallets.buyerAddress) {
    return c.json({ error: 'activate your agent first' }, 400);
  }

  const feeAtomic = BigInt(Math.round(RESEARCH_ACTIVATION_USDC * 10 ** USDC_DECIMALS));
  const balance = await readUsdcBalance(wallets.buyerAddress).catch(() => 0n);
  if (balance < feeAtomic) {
    return c.json(
      {
        error: 'insufficient-balance',
        needUsdc: RESEARCH_ACTIVATION_USDC,
        haveUsdc: Number(formatUnits(balance, USDC_DECIMALS)),
      },
      402,
    );
  }

  try {
    const tx = await executeContractCall(
      {
        walletId: wallets.buyerWalletId,
        contractAddress: config.USDC_ADDR,
        abiFunctionSignature: 'transfer(address,uint256)',
        abiParameters: [config.KARWAN_TREASURY_ADDR, feeAtomic.toString()],
      },
      'research.activate',
    );
    const state = await activateResearch(owner, RESEARCH_ACTIVATION_USDC);
    bus.emitEvent({
      type: 'agent.funded',
      actor: 'platform',
      payload: {
        user: owner,
        agent: 'research',
        amountUsdc: String(RESEARCH_ACTIVATION_USDC),
        scope: 'agent-research-activation',
      },
    });
    logger.info({ owner, txHash: tx.txHash }, 'agent research activated');
    return c.json({ ...state, txHash: tx.txHash });
  } catch (err) {
    logger.error({ owner, err: (err as Error).message }, 'research activation failed');
    return c.json({ error: 'activation failed', detail: (err as Error).message }, 502);
  }
});
