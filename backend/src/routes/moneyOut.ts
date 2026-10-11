import { Hono, type Context } from 'hono';
import { formatUnits } from 'viem';
import { z } from 'zod';
import { DAILY_LIMIT_MICROS, type AccountKind } from '../moneyOut/rules.js';
import type { MoneyOutStore, SavedAddress } from '../moneyOut/store.js';
import type { WorldAccountSessions } from '../worldid/accountSessions.js';
import { WorldSessionError } from '../worldid/dealSessions.js';

const WINDOW_MS = 24 * 3_600_000;
const EVM = /^0x[0-9a-fA-F]{40}$/;
const SOLANA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export interface MoneyOutRouteDeps {
  enabled: boolean;
  now: () => number;
  sessionAddress: (c: Context) => string | null;
  store: MoneyOutStore;
  kindOf: (wallet: string) => Promise<AccountKind>;
  hasSession: (wallet: string) => Promise<boolean>;
  /// Null when World ID is not configured on this backend.
  sessions: () => Pick<WorldAccountSessions, 'request' | 'verify'> | null;
  notifyAddressAdded: (wallet: string, saved: SavedAddress) => Promise<void>;
}

const purpose = z.enum(['enrol', 'add_address', 'return', 'unpause']);
const destination = z
  .object({ chain: z.string().regex(/^[a-z0-9-]{2,32}$/), address: z.string() })
  .refine((d) => (d.chain.startsWith('solana') ? SOLANA : EVM).test(d.address));
const requestSchema = z.object({ purpose });
const verifySchema = z.object({ purpose, idkitResponse: z.record(z.unknown()) });

const usdc = (micros: bigint) => formatUnits(micros, 6);

/// The person's own controls over money leaving the wallets Karwan signs for:
/// saved addresses, the daily limit, pause, and the World ID checks that add
/// an address or unlock the account.
export function createMoneyOutRoutes(deps: MoneyOutRouteDeps): Hono {
  const app = new Hono();

  const signedIn = (c: Context) => deps.sessionAddress(c)?.toLowerCase() ?? null;
  const unauthenticated = (c: Context) => c.json({ error: 'not authenticated' }, 401);
  const worldFailure = (c: Context, error: unknown) => {
    if (error instanceof WorldSessionError) return c.json({ error: error.message, code: error.code }, error.status);
    throw error;
  };
  const worldOff = (c: Context) =>
    c.json({ error: 'World ID is unavailable. Try again shortly.', code: 'WORLD_ID_UNAVAILABLE' }, 503);

  app.get('/status', async (c) => {
    c.header('Cache-Control', 'no-store');
    const wallet = signedIn(c);
    if (!wallet) return unauthenticated(c);
    const now = deps.now();
    const [kind, hasSession, state, addresses, spent] = await Promise.all([
      deps.kindOf(wallet),
      deps.hasSession(wallet),
      deps.store.state(wallet),
      deps.store.listAddresses(wallet),
      deps.store.withAccountLock(wallet, (s) => s.spentSince(now - WINDOW_MS)),
    ]);
    const total = spent.reduce((sum, s) => sum + s.amountMicros, 0n);
    return c.json({
      enabled: deps.enabled,
      kind,
      hasSession,
      paused: state.pausedAt !== null,
      returnCheckDue: state.returnCheckDueAt !== null,
      addresses,
      limitUsdc: usdc(DAILY_LIMIT_MICROS),
      leftUsdc: usdc(total >= DAILY_LIMIT_MICROS ? 0n : DAILY_LIMIT_MICROS - total),
      moreAt: spent.length ? spent[0]!.at + WINDOW_MS : null,
    });
  });

  app.post('/session/request', async (c) => {
    c.header('Cache-Control', 'no-store');
    const wallet = signedIn(c);
    if (!wallet) return unauthenticated(c);
    const parsed = requestSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: 'Unknown check.' }, 400);
    const sessions = deps.sessions();
    if (!sessions) return worldOff(c);
    try {
      return c.json({ request: await sessions.request(wallet, parsed.data.purpose) });
    } catch (error) {
      return worldFailure(c, error);
    }
  });

  app.post('/session/verify', async (c) => {
    c.header('Cache-Control', 'no-store');
    const wallet = signedIn(c);
    if (!wallet) return unauthenticated(c);
    const body = await c.req.json().catch(() => ({}));
    const parsed = verifySchema.safeParse(body);
    if (!parsed.success) return c.json({ error: 'Send the World ID result.' }, 400);
    const check = parsed.data.purpose;

    // Everything that can be refused is refused before the proof is used.
    let dest: z.infer<typeof destination> | null = null;
    if (check === 'add_address') {
      const d = destination.safeParse(body);
      if (!d.success) return c.json({ error: 'That is not an address on that network.' }, 400);
      dest = d.data;
      if ((await deps.kindOf(wallet)) !== 'chat') {
        return c.json(
          { error: 'Your Karwan wallets pay out to your own wallet. Send from there to anyone else.', code: 'MONEY_OUT_OWN_WALLET_ONLY' },
          409,
        );
      }
    }
    const sessions = deps.sessions();
    if (!sessions) return worldOff(c);
    try {
      await sessions.verify(wallet, check, parsed.data.idkitResponse);
    } catch (error) {
      return worldFailure(c, error);
    }

    const now = deps.now();
    if (dest) {
      const saved = await deps.store.addAddress(wallet, dest.chain, dest.address, now);
      await deps.notifyAddressAdded(wallet, saved);
      return c.json({ ok: true, purpose: check, address: saved });
    }
    if (check === 'return') await deps.store.setReturnCheckDue(wallet, null);
    if (check === 'unpause') await deps.store.setPaused(wallet, null);
    return c.json({ ok: true, purpose: check });
  });

  app.delete('/addresses/:id', async (c) => {
    const wallet = signedIn(c);
    if (!wallet) return unauthenticated(c);
    const removed = await deps.store.removeAddress(wallet, c.req.param('id'), deps.now());
    return removed ? c.json({ ok: true }) : c.json({ error: 'No such address on your account.' }, 404);
  });

  app.post('/pause', async (c) => {
    const wallet = signedIn(c);
    if (!wallet) return unauthenticated(c);
    await deps.store.setPaused(wallet, deps.now());
    return c.json({ ok: true, paused: true });
  });

  return app;
}
