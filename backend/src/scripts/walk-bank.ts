/// The walk's bank: one Arc Testnet wallet in the walk's own wallet set that
/// lasts across runs. Each run tops its accounts up from it and the sweep
/// returns what is left, so only the bank ever needs the faucet.
///   node dist/scripts/walk-bank.js          make the bank if missing, print NAME=value lines
///   node dist/scripts/walk-bank.js drip     ask the faucet for Arc Testnet USDC into the bank
/// Refuses a key that is not a Circle TEST key and a production NODE_ENV.

import { config } from '../config.js';
import { circleWalletsClient } from '../circle/wallets.js';
import { walkSetsToMake } from './walk-wallet-sets.js';

const FAUCET_URL = 'https://api.circle.com/v1/faucet/drips';

export function dripBody(address: string): { address: string; blockchain: 'ARC-TESTNET'; usdc: true; native: false } {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error('the bank address is not an address');
  return { address, blockchain: 'ARC-TESTNET', usdc: true, native: false };
}

async function makeBank(): Promise<void> {
  if (process.env.CIRCLE_WALK_BANK_WALLET_ID) return;
  if (!config.CIRCLE_WALLET_SET_ID) throw new Error('the walk wallet set is missing; run the stack once first');
  const res = await circleWalletsClient().createWallets({
    blockchains: ['ARC-TESTNET'],
    count: 1,
    walletSetId: config.CIRCLE_WALLET_SET_ID,
    accountType: 'SCA',
    metadata: [{ name: 'karwan-walk-bank', refId: 'walk-bank' }],
  });
  const wallet = res.data?.wallets?.[0];
  if (!wallet?.id || !wallet.address) throw new Error('createWallets returned no wallet');
  console.log(`CIRCLE_WALK_BANK_WALLET_ID=${wallet.id}`);
  console.log(`CIRCLE_WALK_BANK_ADDRESS=${wallet.address}`);
}

async function drip(): Promise<void> {
  const address = process.env.CIRCLE_WALK_BANK_ADDRESS;
  if (!address) throw new Error('the bank is missing; run without drip first');
  const res = await fetch(FAUCET_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.CIRCLE_API_KEY}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(dripBody(address)),
  });
  const text = (await res.text()).slice(0, 200);
  console.error(`walk: faucet answered ${res.status} for the bank on ARC-TESTNET${res.ok ? '' : `: ${text}`}`);
  if (!res.ok) process.exit(3);
}

async function main(): Promise<void> {
  walkSetsToMake({ apiKey: config.CIRCLE_API_KEY, nodeEnv: config.NODE_ENV, accountSet: 'checked', paylinkSet: 'checked' });
  if (process.argv[2] === 'drip') await drip();
  else await makeBank();
}

if (process.argv[1]?.endsWith('walk-bank.js')) {
  main().catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
