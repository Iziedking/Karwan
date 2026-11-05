/// The walk stack's own Circle wallet sets on Arc Testnet: one for account
/// wallets, one for payment links, so walk wallets never share an index with
/// the testnet app's. Run by scripts/ops/walk-inside.sh when either id is
/// missing; prints NAME=id lines for the sets it made and nothing else.
/// Refuses a key that is not a Circle TEST key and a production NODE_ENV.

import { config } from '../config.js';
import { circleWalletsClient } from '../circle/wallets.js';

export function walkSetsToMake(env: { apiKey?: string; nodeEnv: string; accountSet?: string; paylinkSet?: string }): Array<{ name: string; label: string }> {
  if (!env.apiKey?.startsWith('TEST_API_KEY:')) throw new Error('the walk only runs with a Circle TEST key');
  if (env.nodeEnv === 'production') throw new Error('the walk does not run with NODE_ENV=production');
  const out: Array<{ name: string; label: string }> = [];
  if (!env.accountSet) out.push({ name: 'CIRCLE_WALLET_SET_ID', label: 'Karwan walk accounts' });
  if (!env.paylinkSet) out.push({ name: 'CIRCLE_PAYLINK_WALLET_SET_ID', label: 'Karwan walk payment links' });
  return out;
}

async function main() {
  const todo = walkSetsToMake({
    apiKey: config.CIRCLE_API_KEY,
    nodeEnv: config.NODE_ENV,
    accountSet: config.CIRCLE_WALLET_SET_ID,
    paylinkSet: config.CIRCLE_PAYLINK_WALLET_SET_ID,
  });
  for (const set of todo) {
    const res = await circleWalletsClient().createWalletSet({ name: set.label });
    const id = res.data?.walletSet?.id;
    if (!id) throw new Error('createWalletSet returned no id');
    console.log(`${set.name}=${id}`);
  }
}

if (process.argv[1]?.endsWith('walk-wallet-sets.js')) {
  main().catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
