import { Hono } from 'hono';
import type { UserProfile } from '../db/profiles.js';
import type { MoneyMovement } from '../money/model.js';
import type { MoneyOutStore } from '../moneyOut/store.js';
import { adminDeskStore, requireAdmin } from '../middleware/adminAuth.js';
import { twoPeople } from '../middleware/twoPeople.js';
import { accountRow, accountView, type AccountFacts } from '../ops/accountView.js';
import type { DeskDealRow } from '../ops/deskDeals.js';
import { deskMoveRow } from '../ops/deskMoves.js';

/// Accounts on the desk (view 79): the list, one account, and the money-out
/// pause. Pausing is one teammate with change; lifting a pause the desk set
/// needs a second teammate. The person's own World ID unpause clears it too:
/// it is one pause, one field (money_out_state_v1.paused_at).
export const adminAccountsRoutes = new Hono();

adminAccountsRoutes.use('/accounts', requireAdmin);
adminAccountsRoutes.use('/accounts/*', requireAdmin);

interface AccountsSource {
  profiles: () => Promise<UserProfile[]>;
  deals: () => Promise<DeskDealRow[]>;
  openMoves: () => Promise<MoneyMovement[]>;
  movesFor: (address: string) => Promise<MoneyMovement[]>;
  casesFor: (address: string) => Promise<AccountFacts['cases']>;
  signIn: (address: string) => 'email' | 'wallet';
  telegramLinked: (address: string) => Promise<boolean>;
  balance: (address: string, method: string) => Promise<{ totalUsdc: number; agentsUsdc: number } | null>;
  moneyOut: MoneyOutStore;
}

async function settle<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch {
    return fallback;
  }
}

/// The live readers load lazily, once, so this file stays cheap to import.
async function liveSource(): Promise<AccountsSource> {
  const [{ listProfiles }, { listAllDeals }, { deskDealRow }, moves, { caseStore }, { getUserByAddress }, { getTelegramLink }, { readOwnedBalance }, { moneyOutStore }] = await Promise.all([
    import('../db/profiles.js'),
    import('../db/deals.js'),
    import('../ops/deskDeals.js'),
    import('../db/moneyMovements.js'),
    import('../support/cases.js'),
    import('../db/users.js'),
    import('../db/telegramLinks.js'),
    import('../money/ownedBalance.js'),
    import('../moneyOut/live.js'),
  ]);
  return {
    profiles: () => listProfiles(),
    deals: async () => {
      const [deals, profiles] = await Promise.all([listAllDeals(), listProfiles()]);
      const handles = new Map(profiles.filter((p) => p.handle).map((p) => [p.address.toLowerCase(), p.handle!]));
      return deals.map((d) => deskDealRow(d, (a) => handles.get(a.toLowerCase()) ?? null));
    },
    openMoves: () => moves.listMoneyMovementsForDesk({ since: Date.now(), limit: 1000 }),
    movesFor: (address) => moves.listMoneyMovementsForAddress(address, 50),
    casesFor: async (address) => (await caseStore().forPerson(address)).slice(0, 20),
    // Email accounts are the Circle wallets made at sign-up (db/users.ts).
    signIn: (address) => (getUserByAddress(address) ? 'email' : 'wallet'),
    telegramLinked: async (address) => Boolean(await getTelegramLink(address)),
    balance: async (address, method) => {
      const owned = await readOwnedBalance(address, method);
      return { totalUsdc: owned.exact, agentsUsdc: owned.agents };
    },
    moneyOut: moneyOutStore,
  };
}

let source: AccountsSource | null = null;

async function src(): Promise<AccountsSource> {
  source ??= await liveSource();
  return source;
}

export function useAccountsForTests(s: AccountsSource): void {
  source = s;
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/// Who paused the account from the desk: the newest done pause in the desk
/// log, named; otherwise the person did it themselves.
async function pausedBy(address: string): Promise<string> {
  const rows = await settle(() => adminDeskStore().listActions({ limit: 500 }), []);
  const row = rows.find((r) => r.outcome === 'done' && r.method === 'POST' && r.path.toLowerCase() === `/api/admin/accounts/${address.toLowerCase()}/pause`);
  if (!row) return 'the person';
  const { listMembers } = await import('../db/teamMembers.js');
  const members = await settle(() => listMembers(), []);
  return members.find((m) => m.id === row.memberId)?.name ?? row.memberEmail ?? 'a teammate';
}

adminAccountsRoutes.get('/accounts', async (c) => {
  const source = await src();
  // A person often writes from an email; the desk finds them by it but never
  // sends the email back.
  const email = c.req.query('email')?.trim().toLowerCase();
  const [all, deals, open, paused] = await Promise.all([
    settle(() => source.profiles(), []),
    settle(() => source.deals(), []),
    settle(() => source.openMoves(), []),
    settle(() => source.moneyOut.pausedWallets(), new Map<string, number>()),
  ]);
  const now = Date.now();
  const stuck = new Set(open.filter((m) => deskMoveRow(m, now, () => null).status === 'stuck').map((m) => m.initiatedBy.toLowerCase()));
  const count = (address: string) => {
    const mine = deals.filter((d) => d.buyer.toLowerCase() === address || d.seller.toLowerCase() === address);
    return { deals: mine.length, disputes: mine.filter((d) => d.disputed).length };
  };
  const profiles = email ? all.filter((p) => p.email?.toLowerCase() === email) : all;
  const accounts = profiles
    .map((p) => {
      const key = p.address.toLowerCase();
      return accountRow({ profile: p, ...count(key), stuck: stuck.has(key), pausedAt: paused.get(key) ?? null });
    })
    .sort((a, b) => b.joinedAt - a.joinedAt);
  return c.json({ count: accounts.length, accounts });
});

adminAccountsRoutes.get('/accounts/:address', async (c) => {
  const source = await src();
  const address = c.req.param('address');
  if (!ADDRESS.test(address)) return c.json({ error: 'Not an account address.' }, 400);
  const key = address.toLowerCase();
  const profiles = await settle(() => source.profiles(), []);
  const profile = profiles.find((p) => p.address.toLowerCase() === key);
  if (!profile) return c.json({ error: 'No such account.' }, 404);
  const handles = new Map(profiles.filter((p) => p.handle).map((p) => [p.address.toLowerCase(), p.handle!]));
  const signIn = source.signIn(key);
  const [deals, moves, cases, telegramLinked, balance, state] = await Promise.all([
    settle(() => source.deals(), []),
    settle(() => source.movesFor(key), []),
    settle(() => source.casesFor(key), []),
    settle(() => source.telegramLinked(key), false),
    settle(() => source.balance(key, signIn === 'email' ? 'circle' : 'wallet'), null),
    settle(() => source.moneyOut.state(key), { pausedAt: null, returnCheckDueAt: null }),
  ]);
  const paused = state.pausedAt === null ? null : { at: state.pausedAt, by: await pausedBy(key) };
  return c.json(accountView({
    now: Date.now(),
    profile,
    signIn,
    telegramLinked,
    balance,
    deals: deals.filter((d) => d.buyer.toLowerCase() === key || d.seller.toLowerCase() === key),
    moves,
    cases,
    paused,
    handleOf: (a) => handles.get(a.toLowerCase()) ?? null,
  }));
});

adminAccountsRoutes.post('/accounts/:address/pause', async (c) => {
  const source = await src();
  const address = c.req.param('address');
  if (!ADDRESS.test(address)) return c.json({ error: 'Not an account address.' }, 400);
  const profiles = await settle(() => source.profiles(), []);
  if (!profiles.some((p) => p.address.toLowerCase() === address.toLowerCase())) return c.json({ error: 'No such account.' }, 404);
  await source.moneyOut.setPaused(address.toLowerCase(), Date.now());
  return c.json({ ok: true, paused: true });
});

adminAccountsRoutes.post(
  '/accounts/:address/unpause',
  twoPeople({
    key: 'account-unpause',
    label: 'Lift the pause on an account',
    snapshot: async (path) => {
      const source = await src();
      const address = path.match(/\/accounts\/([^/]+)\/unpause/)?.[1] ?? '';
      return { pausedAt: (await source.moneyOut.state(address.toLowerCase())).pausedAt };
    },
  }),
  async (c) => {
    const source = await src();
    const address = c.req.param('address') ?? '';
    if (!ADDRESS.test(address)) return c.json({ error: 'Not an account address.' }, 400);
    await source.moneyOut.setPaused(address.toLowerCase(), null);
    return c.json({ ok: true, paused: false });
  },
);
