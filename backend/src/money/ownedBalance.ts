import { formatUnits } from 'viem';
import { readUsdcBalance } from '../chain/contracts.js';
import { getAgentWallets } from '../db/agentWallets.js';
import { readPooledBalance } from '../gateway/pooledBalance.js';
import { activeStakeSummary } from '../reputation/stake.js';
import { ownedBalance, type OwnedBalance } from './ownedBalanceModel.js';

export type { OwnedBalance };

const usdc = (raw: bigint) => Number(formatUnits(raw, 6));
const settle = <T>(p: Promise<T>) => p.then((v) => v, () => null);

export async function readOwnedBalance(address: string): Promise<OwnedBalance> {
  const key = address.toLowerCase();
  const record = await getAgentWallets(key).catch(() => null);
  const agent = (addr?: string) => (addr ? settle(readUsdcBalance(addr).then(usdc)) : Promise.resolve(null));
  const [arcWallet, pooled, buyer, seller, staked] = await Promise.all([
    settle(readUsdcBalance(key).then(usdc)),
    settle(readPooledBalance(key).then(({ balance }) => Number(balance.confirmed))),
    agent(record?.buyerAddress),
    agent(record?.sellerAddress),
    settle(activeStakeSummary(key).then((s) => s.stakeUsdc)),
  ]);
  return ownedBalance({ arcWallet, pooled, buyer, seller, staked });
}
