import { seedAgentFromOperator } from '../chain/agentSeed.js';
import { getAgentWallets, saveAgentWallets, type AgentWallets } from '../db/agentWallets.js';
import { bus } from '../events.js';
import { provisionUserAgentWallets } from './wallets.js';

/// A person's buying and selling agents, made the first time something needs
/// them: their first agreed deal, or setting up their Karwan record.
export async function ensureUserAgentWallets(user: string): Promise<AgentWallets> {
  const existing = await getAgentWallets(user);
  if (existing) return existing;
  const provisioned = await provisionUserAgentWallets(user);
  const agents = await saveAgentWallets({ userAddress: user, ...provisioned });
  void seedAgentFromOperator(agents.buyerAddress, { owner: agents.userAddress, agent: 'buyer' });
  void seedAgentFromOperator(agents.sellerAddress, { owner: agents.userAddress, agent: 'seller' });
  bus.emitEvent({
    type: 'agent.activated',
    actor: 'platform',
    payload: { user, buyer: agents.buyerAddress, seller: agents.sellerAddress },
  });
  return agents;
}
