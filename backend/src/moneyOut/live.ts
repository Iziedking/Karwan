import { isChatAccount } from '../channels/accountsLive.js';
import { openLinkFor, tellAccount } from '../channels/sender.js';
import { config } from '../config.js';
import { getAgentWallets } from '../db/agentWallets.js';
import { pgEnabled, postgresExecutor, withPostgresTransaction } from '../db/client.js';
import { chatFundingDeps } from '../deals/chatFundingLive.js';
import { worldIdAccountSessions } from '../routes/worldId.js';
import type { MoneyOutRouteDeps } from '../routes/moneyOut.js';
import { createMoneyOutChat } from './chat.js';
import { createMoneyOutGuard, type MoneyOutGuard } from './guard.js';
import { addressAddedMessage, paymentOutMessage } from './messages.js';
import type { AccountKind } from './rules.js';
import { createMemoryMoneyOutStore, createPostgresMoneyOutStore } from './store.js';

/// On wherever a chat account's deals are held to the beta limits: mainnet,
/// or testnet with the verified network switched on.
const enabled = chatFundingDeps.enabled;

export const moneyOutStore = pgEnabled
  ? createPostgresMoneyOutStore(withPostgresTransaction)
  : createMemoryMoneyOutStore();

const kindOf = async (wallet: string): Promise<AccountKind> => ((await isChatAccount(wallet)) ? 'chat' : 'web');

async function ownAddresses(wallet: string): Promise<string[]> {
  const agents = await getAgentWallets(wallet);
  return [wallet, agents?.buyerAddress, agents?.sellerAddress].filter((a): a is string => !!a).map((a) => a.toLowerCase());
}

/// One of the account's own wallets on Arc: its identity or an agent wallet.
export async function isOwnArcWallet(wallet: string, address: string): Promise<boolean> {
  return (await ownAddresses(wallet)).includes(address.toLowerCase());
}

async function hasSession(wallet: string): Promise<boolean> {
  if (!pgEnabled || !config.WORLD_ID_RP_ID) return false;
  const r = await postgresExecutor().query(
    'SELECT 1 FROM world_id_sessions_v1 WHERE rp_id = $1 AND environment = $2 AND wallet = $3',
    [config.WORLD_ID_RP_ID, config.WORLD_ID_ENVIRONMENT, wallet.toLowerCase()],
  );
  return r.rows.length === 1;
}

let activeGuard: MoneyOutGuard = createMoneyOutGuard({
  enabled,
  now: Date.now,
  store: moneyOutStore,
  kindOf,
  ownAddresses,
  hasSession,
  notify: async (wallet, outgoing) => {
    await tellAccount(wallet, paymentOutMessage(outgoing));
  },
});

/// The Pause and Remove buttons and the check after a long silence, for every
/// chat channel's dispatcher.
export const moneyOutChat = createMoneyOutChat({
  enabled,
  now: Date.now,
  store: moneyOutStore,
  isChatAccount,
  openLink: openLinkFor,
});

/// What every exit asks. Route tests swap the guard to reach a refusal without
/// Circle or a chain.
export const moneyOutGuard: MoneyOutGuard = {
  check: (input, opts) => activeGuard.check(input, opts),
};

export function configureMoneyOutGuard(guard: MoneyOutGuard): () => void {
  const previous = activeGuard;
  activeGuard = guard;
  return () => {
    activeGuard = previous;
  };
}

export const moneyOutRouteDeps: Omit<MoneyOutRouteDeps, 'sessionAddress'> = {
  enabled,
  now: Date.now,
  store: moneyOutStore,
  kindOf,
  hasSession,
  sessions: worldIdAccountSessions,
  notifyAddressAdded: async (wallet, saved) => {
    await tellAccount(wallet, addressAddedMessage(saved));
  },
};
