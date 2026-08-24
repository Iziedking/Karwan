import { Hono } from 'hono';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { erc20Abi, formatUnits, parseEventLogs, parseUnits } from 'viem';
import {
  provisionUserAgentWallets,
  provisionUserBridgeWallet,
  dripTestnetUsdc,
  BASE_SEPOLIA_BLOCKCHAIN,
  ETH_SEPOLIA_BLOCKCHAIN,
  OP_SEPOLIA_BLOCKCHAIN,
  ARB_SEPOLIA_BLOCKCHAIN,
  POLYGON_AMOY_BLOCKCHAIN,
  AVAX_FUJI_BLOCKCHAIN,
  UNI_SEPOLIA_BLOCKCHAIN,
  SOL_DEVNET_BLOCKCHAIN,
  type BridgeBlockchain,
} from '../circle/wallets.js';
import { CCTP_CHAINS, CCTP_CHAIN_KEYS } from '../chain/cctpChains.js';
import {
  getAgentWallets,
  saveAgentWallets,
  updateAgentNames,
  type AgentWallets,
} from '../db/agentWallets.js';
import { getUserByAddress } from '../db/users.js';
import { appendActivity } from '../db/activityLog.js';
import { isSessionSelf } from '../auth/session.js';
import { bindingStateFor } from '../chain/agentBinding.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { usdc as usdcAddress, readUsdcBalance, vault } from '../chain/contracts.js';
import { publicClient } from '../chain/client.js';
import { executeContractCall, getTxState } from '../chain/txs.js';
import {
  canRestartFunding,
  fundingTxHash,
  fundingVerdict,
  type ReceiptStanding,
} from '../money/fundingOutcome.js';
import { seedAgentFromOperator } from '../chain/agentSeed.js';
import { bus } from '../events.js';
import { invalidateDepositIndex } from '../circle/depositWatcher.js';
import { logger } from '../logger.js';
import { config } from '../config.js';
import {
  completeMoneyMovement,
  currentMoneyMovement,
  markMoneyMovementNeedsAttention,
  prepareMoneyMovementContractLeg,
  verifyMoneyMovementLeg,
} from '../money/service.js';
import { ensureCashoutMovement } from '../money/cashout.js';
import {
  ensureAgentFundingMovement,
  matchesAgentFundingTransfer,
  prepareAgentFundingLeg,
} from '../money/agentFunding.js';
import { parseUsdcMicros } from '../money/model.js';
import { invalidBodyMessage } from './invalidBody.js';

// USDC on Arc exposes a 6-decimal ERC-20 interface. Withdrawals move funds
// through that interface, the same one the escrow uses.
const USDC_DECIMALS = 6;

// Starter seed moved from the identity wallet to each agent on activation. The
// seller agent only needs a small Arc gas float; the buyer agent needs working
// USDC to fund escrow. Each is also capped to a share of the identity balance
// so the hub is never fully drained.
const SELLER_SEED_USDC = 2;
const BUYER_SEED_USDC = 10;

const addrSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'expected 0x-prefixed 20-byte hex address');

/// Optional agent display name. Cleaned to a single trimmed line, max 40 chars.
/// Blank/whitespace becomes undefined so the UI shows the default label.
const nameSchema = z.string().max(80).optional();
function cleanName(s: unknown): string | undefined {
  if (typeof s !== 'string') return undefined;
  const t = s.trim().replace(/\s+/g, ' ').slice(0, 40);
  return t.length > 0 ? t : undefined;
}

const activateSchema = z.object({
  address: addrSchema,
  buyerName: nameSchema,
  sellerName: nameSchema,
});

const agentNamesSchema = z.object({
  address: addrSchema,
  buyerName: nameSchema,
  sellerName: nameSchema,
});

/// The agents block returned to the client: addresses plus any custom names.
function agentsPayload(w: AgentWallets) {
  return {
    buyer: w.buyerAddress,
    seller: w.sellerAddress,
    ...(w.buyerName ? { buyerName: w.buyerName } : {}),
    ...(w.sellerName ? { sellerName: w.sellerName } : {}),
  };
}

const withdrawSchema = z.object({
  address: addrSchema,
  agent: z.enum(['buyer', 'seller']),
  toAddress: addrSchema,
  amountUsdc: z.number().positive(),
  /// Client-generated retry identity. Reusing it returns the same movement
  /// reference and Circle idempotency key instead of risking a second spend.
  requestId: z.string().trim().min(8).max(128).optional(),
});

const fundAgentSchema = z.object({
  address: addrSchema,
  agent: z.enum(['buyer', 'seller']),
  amountUsdc: z.number().positive(),
  /// Client-generated retry identity. Reusing it returns the same movement
  /// reference and Circle idempotency key instead of risking a second spend.
  requestId: z.string().trim().min(8).max(128).optional(),
});

const web3FundAgentSchema = z.object({
  address: addrSchema,
  agent: z.enum(['buyer', 'seller']),
  amountUsdc: z.union([
    z.string().trim().regex(/^(0|[1-9]\d*)(?:\.\d{1,6})?$/),
    z.number().positive().finite(),
  ]),
  requestId: z.string().trim().min(8).max(128),
});

const web3FundAgentCompleteSchema = web3FundAgentSchema.extend({
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});

// One withdrawal at a time per user+agent, so a double-click cannot fire two
// transfers against the same agent wallet.
const withdrawInFlight = new Set<string>();

// One fund-agent transfer at a time per user+agent. Same reasoning as the
// withdrawal guard: Circle DCWs serialize tx nonces, a double-click would
// either fail the second tx or stall the first.
const fundInFlight = new Set<string>();

// One activation at a time per address, so a double-click cannot provision two
// wallet pairs for the same user.
const inFlight = new Set<string>();

export const activationRoutes = new Hono();

/// Returns whether a user has activated, and their agent wallet addresses if so.
activationRoutes.get('/status', async (c) => {
  const address = c.req.query('address');
  if (!address) return c.json({ error: 'address query param required' }, 400);
  const parsed = addrSchema.safeParse(address);
  if (!parsed.success) return c.json({ error: 'invalid address' }, 400);
  // Agent addresses and the per-chain deposit map are private: harvesting them
  // across accounts is what turns a shared-address collision into something a
  // stranger can hunt for.
  if (!isSessionSelf(c, parsed.data)) {
    return c.json({ error: 'You can only read your own wallets.', code: 'forbidden' }, 403);
  }

  const wallets = await getAgentWallets(parsed.data);
  if (!wallets) return c.json({ activated: false });
  return c.json({
    activated: true,
    agents: agentsPayload(wallets),
    bridgeWallets: wallets.bridgeWallets ?? {},
  });
});

/// One call that powers the Wallets panel: the logged-in wallet's Arc USDC
/// (identity hub) plus each agent's Arc USDC. Bridge-wallet source balances are
/// read separately via the bridge route (they hit a different chain's RPC and
/// are slower). On Arc, USDC is the gas token, so a single USDC balance per
/// wallet covers both spend and gas.
const WALLETS_TTL_MS = 15_000;
const walletsCache = new Map<string, { at: number; body: unknown }>();

activationRoutes.get('/wallets', async (c) => {
  const address = c.req.query('address');
  if (!address || !addrSchema.safeParse(address).success) {
    return c.json({ error: 'address query param required' }, 400);
  }
  const addr = address.toLowerCase();
  // Balances are private financial data; the deposit map is the enumeration
  // primitive described above.
  if (!isSessionSelf(c, addr)) {
    return c.json({ error: 'You can only read your own wallets.', code: 'forbidden' }, 403);
  }

  // Server-side cache: the top-up/withdraw card polls this per user every few
  // seconds; a short TTL collapses N tabs to one 3-read on-chain fetch.
  const cachedWallets = walletsCache.get(addr);
  if (cachedWallets && Date.now() - cachedWallets.at < WALLETS_TTL_MS) {
    return c.json(cachedWallets.body as Record<string, unknown>);
  }

  let identityUsdc: string | null = null;
  try {
    identityUsdc = formatUnits(await readUsdcBalance(addr), USDC_DECIMALS);
  } catch {
    identityUsdc = null;
  }

  const wallets = await getAgentWallets(addr);
  let agents: {
    buyer: { address: string; usdcBalance: string | null };
    seller: { address: string; usdcBalance: string | null };
  } | null = null;
  if (wallets) {
    const [buyerBal, sellerBal] = await Promise.all([
      readUsdcBalance(wallets.buyerAddress).catch(() => null),
      readUsdcBalance(wallets.sellerAddress).catch(() => null),
    ]);
    agents = {
      buyer: {
        address: wallets.buyerAddress,
        usdcBalance: buyerBal !== null ? formatUnits(buyerBal, USDC_DECIMALS) : null,
      },
      seller: {
        address: wallets.sellerAddress,
        usdcBalance: sellerBal !== null ? formatUnits(sellerBal, USDC_DECIMALS) : null,
      },
    };
  }

  const body = {
    identity: { address: addr, usdcBalance: identityUsdc },
    agents,
    bridgeWallets: wallets?.bridgeWallets ?? {},
  };
  walletsCache.set(addr, { at: Date.now(), body });
  return c.json(body);
});

/// Tops up the user's Base Sepolia bridge wallet with native gas + USDC from the
/// Circle faucet. Lets existing users (whose bridge wallet predates the
/// activation-time drip) and anyone who ran the gas dry refuel in one click so a
/// bridge can actually complete. Provisions the bridge wallet if missing.
const dripBridgeSchema = z.object({
  address: addrSchema,
  // Which CCTP chain's bridge wallet to refuel. Defaults to Base Sepolia.
  chain: z.enum(CCTP_CHAIN_KEYS).optional(),
});
activationRoutes.post(
  '/drip-bridge',
  rateLimit({ windowMs: 10 * 60 * 1000, max: 10, name: 'drip-bridge' }),
  async (c) => {
  let body;
  try {
    body = dripBridgeSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  // PROVISIONS a deposit wallet for the named user when one is missing, which
  // consumes the shared wallet set's per-chain index counter. Left open, a
  // stranger could advance those counters at will (and read back the address).
  if (!isSessionSelf(c, body.address)) {
    return c.json({ error: 'You can only refuel a deposit wallet for your own account.', code: 'forbidden' }, 403);
  }
  const userAddress = body.address.toLowerCase();
  const chainKey = body.chain ?? 'baseSepolia';
  const blockchain = CCTP_CHAINS[chainKey].circleBlockchain;
  // Web3-only chain: Circle cannot hold a wallet there, so there is nothing to
  // drip. See CctpChain.circleBlockchain.
  if (!blockchain) {
    return c.json(
      { error: 'chain_not_circle_supported', detail: `${chainKey} has no Circle wallet; bridge from it with your own wallet` },
      400,
    );
  }
  const wallets = await getAgentWallets(userAddress);
  if (!wallets) return c.json({ error: 'no agent wallets — activate first' }, 409);

  let bridge = wallets.bridgeWallets?.[blockchain];
  if (!bridge) {
    try {
      const provisioned = await provisionUserBridgeWallet(userAddress, blockchain);
      bridge = { walletId: provisioned.walletId, address: provisioned.address };
      await saveAgentWallets({
        ...wallets,
        bridgeWallets: {
          ...(wallets.bridgeWallets ?? {}),
          [blockchain]: bridge,
        },
      });
    } catch (err) {
      return c.json(
        { error: 'bridge wallet provisioning failed', detail: (err as Error).message },
        502,
      );
    }
  }

  // Await the faucet so the UI gets real feedback. Fire-and-forget here is what
  // made the refuel look like it "did nothing" when the faucet rate-limited.
  const drip = await dripTestnetUsdc(bridge.address, {
    blockchain,
    native: true,
    usdc: true,
  });
  if (!drip.ok) {
    const rateLimited =
      drip.status === 429 || /rate|limit|already|too many/i.test(drip.detail ?? '');
    return c.json(
      {
        error: 'faucet request failed',
        detail: rateLimited
          ? 'The faucet is rate-limited for this wallet (about 20 USDC and gas per 2 hours). Wait and try again, or send testnet ETH to the bridge wallet directly.'
          : drip.detail ?? 'Could not reach the faucet just now. Try again in a moment.',
        address: bridge.address,
        blockchain,
      },
      502,
    );
  }
  return c.json({ ok: true, address: bridge.address, blockchain }, 200);
});

/// Arc-USDC faucet for the user's own wallets. `target` picks identity (the
/// logged-in wallet) or an agent wallet. Awaits the faucet so the button can
/// report a rate limit. Testnet only; no-op on a live key.
const faucetSchema = z.object({
  address: addrSchema,
  target: z.enum(['identity', 'buyer', 'seller']),
});
activationRoutes.post(
  '/faucet',
  rateLimit({ windowMs: 10 * 60 * 1000, max: 10, name: 'faucet' }),
  async (c) => {
  let body;
  try {
    body = faucetSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  // Resolves the named address to THAT user's agent wallets and returns them,
  // so it must be the caller's own account: otherwise it is an unauthenticated
  // agent-address disclosure on top of a faucet.
  if (!isSessionSelf(c, body.address)) {
    return c.json({ error: 'You can only claim test funds for your own account.', code: 'forbidden' }, 403);
  }
  const userAddress = body.address.toLowerCase();

  let target = userAddress; // identity = the logged-in wallet, funded on Arc
  if (body.target !== 'identity') {
    const wallets = await getAgentWallets(userAddress);
    if (!wallets) return c.json({ error: 'no agent wallets — activate first' }, 409);
    target = body.target === 'buyer' ? wallets.buyerAddress : wallets.sellerAddress;
  }

  // Defaults to Arc Testnet USDC (the faucet helper's default blockchain).
  const drip = await dripTestnetUsdc(target);
  if (!drip.ok) {
    const rateLimited =
      drip.status === 429 || /rate|limit|already|too many/i.test(drip.detail ?? '');
    return c.json(
      {
        error: 'faucet request failed',
        detail: rateLimited
          ? 'The faucet is rate-limited for this wallet (about 20 USDC per 2 hours). Try again later.'
          : drip.detail ?? 'Could not reach the faucet just now. Try again in a moment.',
        target: body.target,
        address: target,
      },
      502,
    );
  }
  return c.json({ ok: true, target: body.target, address: target }, 200);
});

/// Auto-pool USDC from Circle's faucet to any address on a CCTP source chain.
/// Lets the bridge UI fund the wallet a tester bridges from in-app instead of
/// sending them to faucet.circle.com. USDC only by design: web3 users claim
/// their own native gas from a public faucet (Gas Station only sponsors Circle
/// DCWs), and Circle's faucet declines native drips to external EOAs. Testnet
/// only.
const fundSourceSchema = z.object({
  address: addrSchema,
  chain: z.enum(CCTP_CHAIN_KEYS),
});
activationRoutes.post(
  '/fund-source',
  rateLimit({ windowMs: 10 * 60 * 1000, max: 10, name: 'fund-source' }),
  async (c) => {
  let body;
  try {
    body = fundSourceSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  if (!isSessionSelf(c, body.address)) {
    return c.json({ error: 'You can only request test funds for your own account.', code: 'forbidden' }, 403);
  }
  const blockchain = CCTP_CHAINS[body.chain].circleBlockchain;
  // Circle's faucet is keyed by its own blockchain enum, so a web3-only chain
  // has nothing to drip from. See CctpChain.circleBlockchain.
  if (!blockchain) {
    return c.json(
      { error: 'chain_not_circle_supported', detail: `${body.chain} has no Circle faucet; use that chain's own faucet` },
      400,
    );
  }
  const drip = await dripTestnetUsdc(body.address.toLowerCase(), {
    blockchain,
    native: false,
    usdc: true,
  });
  if (!drip.ok) {
    // The faucet caps ~20 USDC per address, per chain, per 2h, plus per-key/IP
    // limits. Over-quota comes back as 429 or a 403 {"code":3,"message":
    // "Forbidden"}. Map both to one clear line instead of leaking raw JSON.
    const declined =
      drip.status === 429 ||
      drip.status === 403 ||
      /rate|limit|already|too many|forbidden/i.test(drip.detail ?? '');
    return c.json(
      {
        error: 'faucet request failed',
        detail: declined
          ? 'The faucet declined this request. It allows about 20 USDC per chain every 2 hours. Wait and retry, or claim from faucet.circle.com.'
          : drip.detail ?? 'Could not reach the faucet just now. Try again in a moment.',
        chain: body.chain,
      },
      502,
    );
  }
  return c.json({ ok: true, chain: body.chain }, 200);
});

/// Provisions a buyer agent wallet and a seller agent wallet for the user.
/// Idempotent: if the user already has agent wallets, returns them unchanged.
activationRoutes.post('/activate', async (c) => {
  let body;
  try {
    body = activateSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  // Activation provisions Circle wallets and seeds operator float — only the
  // signed-in owner may trigger it for their own address (sign-in always
  // precedes activation, so a session exists here).
  if (!isSessionSelf(c, body.address)) {
    return c.json({ error: 'You can only activate your own account.', code: 'forbidden' }, 403);
  }
  const userAddress = body.address.toLowerCase();

  const existing = await getAgentWallets(userAddress);
  if (existing) {
    // Already activated: idempotent. Name changes go through /agent-names, not a
    // repeat activate, so we don't disturb existing names here. Still re-attempt
    // the operator seed: it is idempotent (skips an agent already holding the
    // float), so a repeat activate tops up agents that were provisioned before
    // the seed shipped, or while the operator wallet was empty. This is the
    // backfill path for any account, person or business, that activated unfunded.
    void seedAgentFromOperator(existing.buyerAddress, { owner: userAddress, agent: 'buyer' });
    void seedAgentFromOperator(existing.sellerAddress, { owner: userAddress, agent: 'seller' });
    return c.json({ activated: true, agents: agentsPayload(existing) });
  }

  if (inFlight.has(userAddress)) {
    return c.json({ error: 'activation already in progress' }, 409);
  }

  inFlight.add(userAddress);
  try {
    const provisioned = await provisionUserAgentWallets(userAddress);

    // Provision every deposit chain up front, not just Base.
    //
    // This is load-bearing now, not a latency trick. The deposit card tells the
    // user to send USDC from any of these chains to one address, and Circle only
    // emits an inbound webhook for a chain it holds a wallet on. An unprovisioned
    // chain is therefore not a slow credit, it is a deposit that arrives and is
    // never noticed.
    //
    // Solana especially benefits: its create-wallet path was hanging on a
    // /bridge first-pick, leaving users on "provisioning..." indefinitely
    // (Circle's SOL-DEVNET create sometimes never returns). Doing it here moves
    // the failure to where the user expects creation work.
    //
    // Only Circle/email accounts get backend deposit wallets. Web3 accounts
    // bridge from their own connected wallet and never touch a backend-signed
    // source DCW, so a deposit wallet is unusable to them AND provisioning one
    // advances the shared wallet set's per-chain index counter, which is what
    // collides addresses across users. See provisionUserBridgeWallet, which
    // refuses this at the source.
    let bridgeWallets: Record<string, { walletId: string; address: string }> = {};
    const isCircleAccount = !!getUserByAddress(userAddress)?.circleIdentityWalletId;
    // EVERY chain a backend DCW can sign a CCTP burn on, not just the four the
    // deposit card advertises. The deposit address is the same 0x on all EVM
    // chains, so a user who sends on Optimism, Avalanche or Unichain lands at a
    // real address either way. Whether the money then moves depended entirely on
    // whether a wallet record existed for that chain, because depositWatcher
    // indexes on `bridgeWallets` — so three chains silently swallowed deposits
    // and never bridged. Sei, Sonic, World Chain and HyperEVM stay off this list
    // on purpose: Circle exposes them as EOA-only, and a CCTP burn is a contract
    // call, so no backend wallet can sign there. Those remain web3-only.
    const eagerBridgeChains: BridgeBlockchain[] = isCircleAccount
      ? [
          BASE_SEPOLIA_BLOCKCHAIN,
          ETH_SEPOLIA_BLOCKCHAIN,
          OP_SEPOLIA_BLOCKCHAIN,
          ARB_SEPOLIA_BLOCKCHAIN,
          POLYGON_AMOY_BLOCKCHAIN,
          AVAX_FUJI_BLOCKCHAIN,
          UNI_SEPOLIA_BLOCKCHAIN,
          SOL_DEVNET_BLOCKCHAIN,
        ]
      : [];

    // In parallel, so eight chains cost the slowest one rather than the sum.
    // Safe to parallelise only because deriveOnly forbids the createWallets
    // fallback on the EVM chains, which is the one step that consumes a shared
    // index. Solana has no derive path and is the single create here by design.
    const provisioning = await Promise.allSettled(
      eagerBridgeChains.map((chain) =>
        provisionUserBridgeWallet(userAddress, chain, undefined, {
          deriveOnly: chain !== SOL_DEVNET_BLOCKCHAIN,
        }),
      ),
    );
    for (const [i, result] of provisioning.entries()) {
      const chain = eagerBridgeChains[i]!;
      if (result.status === 'fulfilled') {
        bridgeWallets[chain] = {
          walletId: result.value.walletId,
          address: result.value.address,
        };
      } else {
        // Not load-bearing for activation itself: agents still ship and the
        // chain lazy-provisions on first use. A deposit sent to that chain
        // before then is missed, which is why the deposit card offers only the
        // chains actually present on the record.
        logger.warn(
          { userAddress, chain, err: (result.reason as Error)?.message },
          'eager deposit wallet provisioning failed during activation; will lazy-provision later',
        );
      }
    }

    // A deposit landing in the first minute of an account's life must still be
    // recognised, so drop the watcher's reverse index rather than let it expire
    // with these addresses missing from it.
    invalidateDepositIndex();

    const record = await saveAgentWallets({
      userAddress,
      ...provisioned,
      bridgeWallets,
      buyerName: cleanName(body.buyerName),
      sellerName: cleanName(body.sellerName),
    });

    // Bind each agent → identity on the vault so a stake-backed reservation
    // (acceptEscrow) resolves to the wallet that actually holds the stake.
    //
    // This only completes here for an account whose identity is a wallet we
    // sign with: the vault requires the OWNER to approve the agent first, and
    // for a connected wallet that signature is the user's. They complete it on
    // /stake, which is where stake starts mattering.
    void bindAgentsAtActivation(userAddress, record);

    // Seed both agents with a small USDC float from the operator wallet so the
    // user lands ready to trade. This is the reliable funding path: the public
    // faucet is rate-limited on testnet and absent on mainnet. Best-effort,
    // idempotent (skips an already-funded agent), and never blocks activation.
    void seedAgentFromOperator(record.buyerAddress, { owner: userAddress, agent: 'buyer' });
    void seedAgentFromOperator(record.sellerAddress, { owner: userAddress, agent: 'seller' });

    // Legacy fallback: top up from the user's own identity wallet when it holds
    // funds (e.g. a Circle user who already topped up). The operator seed above
    // already covers the common case; this is harmless and no-ops on an empty
    // identity. Fire-and-forget, Circle users only. See seedAgentsFromIdentity.
    void seedAgentsFromIdentity(userAddress, record);

    // Give the Base Sepolia bridge wallet native gas + USDC so a Circle user can
    // bridge without bringing Sepolia ETH for the CCTP approve+burn gas. Circle
    // users only: web3 users bridge from their own wallet and never touch the
    // backend-signed source DCW, so there's nothing to pre-fund for them.
    const baseBridgeAddr = record.bridgeWallets?.[BASE_SEPOLIA_BLOCKCHAIN]?.address;
    if (baseBridgeAddr && getUserByAddress(userAddress)?.circleIdentityWalletId) {
      void dripTestnetUsdc(baseBridgeAddr, {
        blockchain: BASE_SEPOLIA_BLOCKCHAIN,
        native: true,
        usdc: true,
      });
    }

    bus.emitEvent({
      type: 'agent.activated',
      actor: 'platform',
      payload: {
        user: userAddress,
        buyer: record.buyerAddress,
        seller: record.sellerAddress,
      },
    });
    logger.info(
      {
        userAddress,
        buyer: record.buyerAddress,
        seller: record.sellerAddress,
        bridgeChains: Object.keys(record.bridgeWallets ?? {}),
      },
      'user agent wallets provisioned',
    );
    return c.json({
      activated: true,
      agents: agentsPayload(record),
      bridgeWallets: record.bridgeWallets ?? {},
    });
  } catch (err) {
    logger.error({ userAddress, err: (err as Error).message }, 'activation failed');
    return c.json({ error: 'activation failed', detail: (err as Error).message }, 502);
  } finally {
    inFlight.delete(userAddress);
  }
});

/// Rename the user's agents (or clear back to the defaults by sending blanks).
/// Session-gated: you can only rename your own agents. Names are display-only,
/// never touch the on-chain wallets, so this is a cheap off-chain update that
/// preserves the agents' createdAt.
activationRoutes.post('/agent-names', async (c) => {
  let body;
  try {
    body = agentNamesSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  if (!isSessionSelf(c, body.address)) {
    return c.json({ error: 'You can only rename your own agents.', code: 'forbidden' }, 403);
  }
  const updated = await updateAgentNames(body.address, {
    buyerName: cleanName(body.buyerName),
    sellerName: cleanName(body.sellerName),
  });
  if (!updated) return c.json({ error: 'no agent wallets — activate first' }, 409);
  return c.json({ activated: true, agents: agentsPayload(updated) });
});

/// Withdraws USDC from one of the user's agent wallets to an external address.
/// The agent wallet signs the transfer through Circle, so the user never needs
/// the agent's keys to pull funds back out.
activationRoutes.post('/withdraw', async (c) => {
  let body;
  try {
    body = withdrawSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  const userAddress = body.address.toLowerCase();
  // Session gate: only the wallet owner may pull funds OUT of their agent wallet.
  // Without this, any caller could drain any user's agent balance to an arbitrary
  // toAddress by naming the victim's (public) address. Matches the /agent-names
  // gate; all users (web3 via SIWE, Circle via passkey) carry a session now.
  if (!isSessionSelf(c, userAddress)) {
    return c.json({ error: 'You can only withdraw from your own agent wallet.', code: 'forbidden' }, 403);
  }

  const wallets = await getAgentWallets(userAddress);
  if (!wallets) {
    return c.json({ error: 'no agent wallets for this address' }, 409);
  }
  const walletId =
    body.agent === 'buyer' ? wallets.buyerWalletId : wallets.sellerWalletId;
  const agentAddress =
    body.agent === 'buyer' ? wallets.buyerAddress : wallets.sellerAddress;
  if (!walletId || !agentAddress) {
    return c.json({ error: `${body.agent} agent wallet is not available`, code: 'NO_AGENT_WALLET' }, 409);
  }

  // Balance precheck so an over-withdrawal returns a clear "insufficient
  // balance" with the available amount, not a raw Circle/chain revert. An SCA
  // transfer can land as a "successful" handleOps tx while the inner transfer
  // reverts on a short balance, so checking up front is the only reliable signal.
  const amountWei = parseUnits(body.amountUsdc.toString(), USDC_DECIMALS);
  try {
    const balance = await readUsdcBalance(agentAddress);
    if (balance < amountWei) {
      return c.json(
        {
          error: 'insufficient balance',
          detail: `Your ${body.agent} agent holds ${formatUnits(balance, USDC_DECIMALS)} USDC, less than the ${body.amountUsdc} you tried to withdraw. Lower the amount and try again.`,
          available: formatUnits(balance, USDC_DECIMALS),
          requested: body.amountUsdc.toString(),
          agent: body.agent,
        },
        409,
      );
    }
  } catch (err) {
    logger.warn(
      { userAddress, agent: body.agent, err: (err as Error).message },
      'withdraw balance precheck read failed; attempting transfer anyway',
    );
  }

  const key = `${userAddress}:${body.agent}`;
  if (withdrawInFlight.has(key)) {
    return c.json({ error: 'a withdrawal is already in progress for this agent' }, 409);
  }

  withdrawInFlight.add(key);
  let movementReference: string | undefined;
  try {
    const requestKey = body.requestId ?? randomUUID();
    const { movement } = await ensureCashoutMovement({
      operationKey: `cashout:agent-withdraw:${userAddress}:${body.agent}:${requestKey}`,
      amountUsdc: body.amountUsdc.toString(),
      initiatedBy: userAddress,
      recipient: body.toAddress,
      summary: `Withdrew ${body.amountUsdc} USDC from the ${body.agent} agent wallet to ${body.toAddress.toLowerCase()}`,
    });
    movementReference = movement.reference;
    const current = await currentMoneyMovement(movement.reference);
    const existingLeg = current.legs.find(
      (leg) => leg.attempt === current.attempt && leg.key === 'arc_transfer',
    );
    if (current.state === 'completed' && existingLeg?.txHash) {
      return c.json({
        accepted: true,
        alreadyRecorded: true,
        txHash: existingLeg.txHash,
        explorerUrl: existingLeg.explorerUrl ?? null,
        reference: current.reference,
        movementState: current.state,
      }, 200);
    }
    if (current.state === 'needs_attention') {
      return c.json({
        accepted: false,
        error: 'withdrawal needs attention',
        reference: current.reference,
        movementState: current.state,
      }, 409);
    }

    const prepared = await prepareMoneyMovementContractLeg(movement.reference, {
      key: 'arc_transfer',
      label: `Arc USDC withdrawal from ${body.agent} agent`,
      rail: 'circle_wallets',
      walletId,
      signerAddress: agentAddress,
      sourceAddress: agentAddress,
      destinationAddress: body.toAddress,
      contractAddress: usdcAddress,
      amountMicros: amountWei,
    });
    const result = await executeContractCall(
      {
        walletId,
        contractAddress: usdcAddress,
        abiFunctionSignature: 'transfer(address,uint256)',
        abiParameters: [body.toAddress, amountWei.toString()],
        idempotencyKey: prepared.idempotencyKey,
        lifecycle: prepared.lifecycle,
      },
      `withdraw(${body.agent} agent -> ${body.toAddress})`,
    );
    await verifyMoneyMovementLeg(movement.reference, prepared.leg.id);
    const completed = await completeMoneyMovement(movement.reference);
    bus.emitEvent({
      type: 'agent.withdrawal',
      actor: 'platform',
      payload: {
        user: userAddress,
        agent: body.agent,
        toAddress: body.toAddress.toLowerCase(),
        amountUsdc: body.amountUsdc.toString(),
        txHash: result.txHash,
        reference: completed.reference,
        movementState: completed.state,
      },
    });
    void appendActivity({
      address: userAddress,
      kind: 'withdraw',
      summary: `Withdrew ${body.amountUsdc} USDC from the ${body.agent} agent wallet to ${body.toAddress.toLowerCase()}`,
      params: {t: 'agentWithdraw', agent: body.agent, amount: String(body.amountUsdc), to: body.toAddress.toLowerCase()},
      amountUsdc: body.amountUsdc.toString(),
      txHash: result.txHash,
      refId: completed.reference,
      counterparty: body.toAddress.toLowerCase(),
    });
    logger.info(
      { userAddress, agent: body.agent, toAddress: body.toAddress, txHash: result.txHash },
      'agent wallet withdrawal sent',
    );
    return c.json({
      accepted: true,
      txHash: result.txHash,
      reference: completed.reference,
      movementState: completed.state,
    }, 200);
  } catch (err) {
    logger.error({ userAddress, err: (err as Error).message }, 'withdrawal failed');
    const reference = movementReference;
    if (reference) {
      const attention = await markMoneyMovementNeedsAttention(reference, 'AGENT_WITHDRAW_UNKNOWN_OUTCOME').catch(() => null);
      return c.json({
        error: 'withdrawal needs attention',
        detail: (err as Error).message,
        reference,
        movementState: attention?.state ?? 'needs_attention',
      }, 502);
    }
    return c.json({ error: 'withdrawal failed', detail: (err as Error).message }, 502);
  } finally {
    withdrawInFlight.delete(key);
  }
});

/// Tops up an agent wallet from the user's Circle identity DCW. Only available
/// to Circle-auth users; web3 users have no server-side wallet for us to sign
/// from, so they take the existing wagmi path on the frontend.
///
/// Both legs are Circle DCWs the backend already controls, so no user signature
/// is required and gas is sponsored by Circle. A one-click transfer.
activationRoutes.post('/fund-agent', async (c) => {
  let body;
  try {
    body = fundAgentSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  const userAddress = body.address.toLowerCase();
  // Session gate, same as /withdraw: only the owner may move their identity
  // wallet's funds into their agent.
  if (!isSessionSelf(c, userAddress)) {
    return c.json({ error: 'You can only fund your own agent wallet.', code: 'forbidden' }, 403);
  }

  const user = getUserByAddress(userAddress);
  if (!user) {
    // Web3 users don't have a server-side identity wallet. They should be
    // using the wagmi top-up flow instead.
    return c.json(
      {
        error: 'no Circle identity wallet for this address',
        detail: 'fund-agent is only available to Circle-auth users. Use the on-chain top-up.',
      },
      409,
    );
  }

  const wallets = await getAgentWallets(userAddress);
  if (!wallets) {
    return c.json({ error: 'no agent wallets — activate agents first' }, 409);
  }
  const agentAddress =
    body.agent === 'buyer' ? wallets.buyerAddress : wallets.sellerAddress;

  const key = `${userAddress}:${body.agent}`;
  if (fundInFlight.has(key)) {
    return c.json({ error: 'a fund transfer is already in progress for this agent' }, 409);
  }

  fundInFlight.add(key);
  let movementReference: string | undefined;
  /// The transfer's hash, once it has been sent. The steps after sending are
  /// recording steps, and a failure in one of them says nothing about whether
  /// the money moved: this is what lets the catch find out instead of assuming.
  let sentTxHash: string | undefined;
  try {
    const amountWei = parseUnits(body.amountUsdc.toString(), USDC_DECIMALS);
    const requestKey = body.requestId ?? randomUUID();
    const { movement } = await ensureAgentFundingMovement({
      operationKey: `agent-funding:identity-to-agent:${userAddress}:${body.agent}:${requestKey}`,
      amountUsdc: body.amountUsdc.toString(),
      initiatedBy: userAddress,
      sourceAddress: userAddress,
      destinationAddress: agentAddress,
      summary: `Funded the ${body.agent} agent wallet with ${body.amountUsdc} USDC from the identity wallet`,
    });
    movementReference = movement.reference;
    const current = await currentMoneyMovement(movement.reference);
    const existingLeg = current.legs.find(
      (leg) => leg.attempt === current.attempt && leg.key === 'arc_transfer',
    );
    if (current.state === 'completed' && existingLeg?.txHash) {
      return c.json({
        accepted: true,
        alreadyRecorded: true,
        txHash: existingLeg.txHash,
        explorerUrl: existingLeg.explorerUrl ?? null,
        agentAddress,
        reference: current.reference,
        movementState: current.state,
      }, 200);
    }
    if (current.state === 'needs_attention') {
      // This used to be a flat 409, which made the state permanent: every
      // retry came back to the same refusal, so a transfer that had landed
      // could never be recorded and the row read Failed forever. There is no
      // separate reconcile route on this path, so the recovery happens here.
      const standing = await agentFundingStanding(movement.reference, undefined).catch(() => null);
      if (standing?.verdict === 'landed' && standing.leg) {
        const recorded = await recordAgentFundingSuccess(
          movement.reference,
          standing.leg.id,
        ).catch(() => null);
        if (recorded) {
          logger.info(
            { userAddress, agent: body.agent, txHash: standing.txHash },
            'fund-agent recovered on retry: the earlier transfer had landed',
          );
          return c.json({
            accepted: true,
            alreadyRecorded: true,
            txHash: standing.txHash,
            agentAddress,
            reference: recorded.reference,
            movementState: recorded.state,
          }, 200);
        }
      }
      if (!canRestartFunding(current.legs)) {
        // A hash exists and the chain has not confirmed it yet. Sending again
        // would move the money twice.
        return c.json({
          accepted: false,
          error: 'This transfer is already on chain. Karwan is confirming it.',
          code: 'funding_in_flight',
          agentAddress,
          reference: current.reference,
          movementState: current.state,
          txHash: standing?.txHash ?? null,
        }, 409);
      }
      logger.info(
        { userAddress, agent: body.agent, reference: current.reference },
        'restarting an identity funding attempt that stalled before anything was sent',
      );
    }
    const prepared = await prepareAgentFundingLeg(movement.reference, {
      walletId: user.circleIdentityWalletId,
      signerAddress: userAddress,
      sourceAddress: userAddress,
      destinationAddress: agentAddress,
      contractAddress: usdcAddress,
      amountMicros: amountWei,
    });
    const result = await executeContractCall(
      {
        walletId: user.circleIdentityWalletId,
        contractAddress: usdcAddress,
        abiFunctionSignature: 'transfer(address,uint256)',
        abiParameters: [agentAddress, amountWei.toString()],
        idempotencyKey: prepared.idempotencyKey,
        lifecycle: prepared.lifecycle,
      },
      `fund-agent(${body.agent} <- identity ${userAddress})`,
    );
    // Held outside the try's own scope so the catch can ask the chain whether
    // this landed. Everything below is bookkeeping.
    sentTxHash = result.txHash;
    const verified = await verifyMoneyMovementLeg(movement.reference, prepared.leg.id);
    const completed = await completeMoneyMovement(verified.reference);
    bus.emitEvent({
      type: 'agent.funded',
      actor: 'platform',
      payload: {
        user: userAddress,
        agent: body.agent,
        agentAddress: agentAddress.toLowerCase(),
        amountUsdc: body.amountUsdc.toString(),
        txHash: result.txHash,
        reference: completed.reference,
        movementState: completed.state,
      },
    });
    void appendActivity({
      address: userAddress,
      kind: 'agent_topup',
      summary: `Topped up the ${body.agent} agent wallet with ${body.amountUsdc} USDC from the sign-in wallet`,
      params: {t: 'agentTopUp', agent: body.agent, amount: String(body.amountUsdc)},
      amountUsdc: body.amountUsdc.toString(),
      txHash: result.txHash,
      refId: completed.reference,
    });
    logger.info(
      {
        userAddress,
        agent: body.agent,
        agentAddress,
        amountUsdc: body.amountUsdc,
        txHash: result.txHash,
      },
      'agent wallet funded from identity DCW',
    );
    return c.json({
      accepted: true,
      txHash: result.txHash,
      agentAddress,
      reference: completed.reference,
      movementState: completed.state,
    }, 200);
  } catch (err) {
    logger.error(
      { userAddress, agent: body.agent, err: (err as Error).message, txHash: sentTxHash },
      'fund-agent failed',
    );
    // Everything after the transfer itself is bookkeeping, and this catch used
    // to mark the movement as needing attention without ever asking the chain.
    // A user whose USDC had moved was shown "Failed" beside the transaction
    // that moved it. Find out first.
    if (movementReference) {
      const standing = await agentFundingStanding(movementReference, sentTxHash).catch(() => null);
      if (standing?.verdict === 'landed' && standing.leg) {
        try {
          const recorded = await recordAgentFundingSuccess(movementReference, standing.leg.id);
          logger.info(
            { userAddress, agent: body.agent, txHash: standing.txHash },
            'fund-agent recovered: the transfer landed and the record caught up',
          );
          return c.json({
            accepted: true,
            txHash: standing.txHash,
            agentAddress,
            reference: recorded.reference,
            movementState: recorded.state,
          }, 200);
        } catch (recoveryErr) {
          // The money moved and the record still cannot be closed. Say that,
          // with the transaction attached, rather than calling it a failure.
          logger.error(
            { userAddress, txHash: standing.txHash, err: (recoveryErr as Error).message },
            'fund-agent landed but could not be recorded',
          );
          const attention = await markMoneyMovementNeedsAttention(
            movementReference,
            'AGENT_FUNDING_LANDED_UNRECORDED',
          ).catch(() => null);
          return c.json({
            error: 'The transfer went through. Karwan is still confirming it.',
            code: 'funding_landed_unrecorded',
            txHash: standing.txHash,
            reference: movementReference,
            movementState: attention?.state ?? 'needs_attention',
          }, 202);
        }
      }
      logger.warn(
        {
          userAddress,
          agent: body.agent,
          verdict: standing?.verdict ?? 'unknown',
          receipt: standing?.receipt,
          txHash: standing?.txHash,
        },
        'fund-agent could not be confirmed on chain',
      );
      const attention = await markMoneyMovementNeedsAttention(
        movementReference,
        standing?.verdict === 'did_not_land'
          ? 'AGENT_FUNDING_FAILED'
          : 'AGENT_FUNDING_UNKNOWN_OUTCOME',
      ).catch(() => null);
      // Two different things, and they had better not read the same. One means
      // nothing moved and they can try again. The other means Karwan does not
      // know yet, which is not the user's problem to solve by re-sending.
      return c.json({
        error:
          standing?.verdict === 'did_not_land'
            ? 'The transfer did not go through. Nothing left your wallet.'
            : 'Karwan is still confirming this transfer. Check activity in a moment.',
        code: standing?.verdict === 'did_not_land' ? 'funding_failed' : 'funding_unconfirmed',
        detail: (err as Error).message,
        ...(standing?.txHash ? { txHash: standing.txHash } : {}),
        reference: movementReference,
        movementState: attention?.state ?? 'needs_attention',
      }, 502);
    }
    return c.json({ error: 'fund-agent failed', detail: (err as Error).message }, 502);
  } finally {
    fundInFlight.delete(key);
  }
});

/// Allocate a receipt before a connected web3 wallet signs an ERC-20 USDC
/// transfer to its agent. The browser owns the signing step, so this route
/// only prepares the durable movement and returns the recipient/reference.
activationRoutes.post('/fund-agent-web3/intent', async (c) => {
  let body;
  try {
    body = web3FundAgentSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  const userAddress = body.address.toLowerCase();
  if (!isSessionSelf(c, userAddress)) {
    return c.json({ error: 'You can only fund your own agent wallet.', code: 'forbidden' }, 403);
  }
  const wallets = await getAgentWallets(userAddress);
  if (!wallets) return c.json({ error: 'no agent wallets — activate agents first' }, 409);
  const agentAddress = body.agent === 'buyer' ? wallets.buyerAddress : wallets.sellerAddress;
  const amountUsdc = String(body.amountUsdc);
  let movementReference: string | undefined;
  try {
    const amountMicros = parseUsdcMicros(amountUsdc);
    if (amountMicros <= 0n) return c.json({ error: 'amount must be greater than zero' }, 400);
    const ensured = await ensureAgentFundingMovement({
      operationKey: `agent-funding:web3:${userAddress}:${body.agent}:${body.requestId}`,
      amountUsdc,
      initiatedBy: userAddress,
      sourceAddress: userAddress,
      destinationAddress: agentAddress,
      summary: `Funded the ${body.agent} agent wallet with ${amountUsdc} USDC from the connected wallet`,
    });
    movementReference = ensured.movement.reference;
    const current = await currentMoneyMovement(movementReference);
    const existingLeg = current.legs.find(
      (leg) => leg.attempt === current.attempt && leg.key === 'arc_transfer',
    );
    if (current.state === 'completed' && existingLeg?.txHash) {
      return c.json({
        accepted: true,
        alreadyRecorded: true,
        txHash: existingLeg.txHash,
        explorerUrl: existingLeg.explorerUrl ?? null,
        agentAddress,
        reference: current.reference,
        movementState: current.state,
      }, 200);
    }
    if (current.state === 'needs_attention' && !canRestartFunding(current.legs)) {
      // A hash under this movement means a transfer may already be on chain.
      // Sending again would move the money twice, so this one is finished
      // through /complete against its proof rather than started over.
      return c.json({
        accepted: false,
        error: 'This transfer is already on chain. Karwan is confirming it.',
        code: 'funding_in_flight',
        agentAddress,
        reference: current.reference,
        movementState: current.state,
        txHash: current.legs.find((leg) => leg.txHash)?.txHash ?? null,
      }, 409);
    }
    if (current.state === 'needs_attention') {
      // Nothing was ever sent under it. Refusing here is what made the state
      // permanent: every retry came back to the same 409.
      logger.info(
        { userAddress, agent: body.agent, reference: current.reference },
        'restarting a funding intent that stalled before anything was sent',
      );
    }
    const prepared = await prepareAgentFundingLeg(movementReference, {
      signerAddress: userAddress,
      sourceAddress: userAddress,
      destinationAddress: agentAddress,
      contractAddress: usdcAddress,
      amountMicros,
    });
    return c.json({
      accepted: true,
      agentAddress,
      amountUsdc,
      reference: prepared.movement.reference,
      movementState: prepared.movement.state,
    }, 200);
  } catch (err) {
    logger.error({ userAddress, agent: body.agent, err: (err as Error).message }, 'web3 fund intent failed');
    if (movementReference) {
      const attention = await markMoneyMovementNeedsAttention(
        movementReference,
        'WEB3_AGENT_FUNDING_INTENT_FAILED',
      ).catch(() => null);
      return c.json({
        error: 'Could not start the transfer. Nothing left your wallet.',
        code: 'funding_failed',
        reference: movementReference,
        movementState: attention?.state ?? 'needs_attention',
      }, 502);
    }
    return c.json({ error: 'fund transfer intent failed' }, 502);
  }
});

/// Reconcile the tx signed by a connected wallet. Completion is accepted only
/// when Arc confirms a successful ERC-20 transfer from the session address to
/// the selected agent for the exact six-decimal USDC amount.
activationRoutes.post('/fund-agent-web3/complete', async (c) => {
  let body;
  try {
    body = web3FundAgentCompleteSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  const userAddress = body.address.toLowerCase();
  if (!isSessionSelf(c, userAddress)) {
    return c.json({ error: 'You can only fund your own agent wallet.', code: 'forbidden' }, 403);
  }
  const wallets = await getAgentWallets(userAddress);
  if (!wallets) return c.json({ error: 'no agent wallets — activate agents first' }, 409);
  const agentAddress = body.agent === 'buyer' ? wallets.buyerAddress : wallets.sellerAddress;
  const amountUsdc = String(body.amountUsdc);
  const amountMicros = parseUsdcMicros(amountUsdc);
  const operationKey = `agent-funding:web3:${userAddress}:${body.agent}:${body.requestId}`;
  let movementReference: string | undefined;
  try {
    const ensured = await ensureAgentFundingMovement({
      operationKey,
      amountUsdc,
      initiatedBy: userAddress,
      sourceAddress: userAddress,
      destinationAddress: agentAddress,
      summary: `Funded the ${body.agent} agent wallet with ${amountUsdc} USDC from the connected wallet`,
    });
    movementReference = ensured.movement.reference;
    let movement = await currentMoneyMovement(movementReference);
    if (movement.amountMicros !== amountMicros.toString()) {
      return c.json({ error: 'amount does not match the original funding intent', code: 'amount_mismatch' }, 409);
    }
    const currentLeg = movement.legs.find(
      (leg) => leg.attempt === movement.attempt && leg.key === 'arc_transfer',
    );
    if (!currentLeg) return c.json({ error: 'funding intent is not prepared' }, 409);
    if (movement.state === 'completed' && currentLeg.txHash) {
      return c.json({
        accepted: true,
        alreadyRecorded: true,
        txHash: currentLeg.txHash,
        explorerUrl: currentLeg.explorerUrl ?? null,
        agentAddress,
        reference: movement.reference,
        movementState: movement.state,
      }, 200);
    }
    if (movement.state === 'needs_attention') {
      // Deliberately not a refusal. This route proves the transfer against the
      // Arc receipt below, and that proof is exactly what should clear the
      // flag. Returning 409 here made the state permanent: the user's own
      // wallet had signed, the chain had mined it, and neither retry nor the
      // resume pass could ever record it. If the proof does not hold, the
      // checks below leave the movement exactly as they found it.
      logger.info(
        { userAddress, agent: body.agent, reference: movement.reference, txHash: body.txHash },
        'recovering a funding movement that needs attention, against its receipt',
      );
    }

    const receipt = await publicClient.getTransactionReceipt({ hash: body.txHash as `0x${string}` });
    if (receipt.status !== 'success' || receipt.to?.toLowerCase() !== usdcAddress.toLowerCase()) {
      const attention = await markMoneyMovementNeedsAttention(
        movement.reference,
        receipt.status === 'reverted' ? 'WEB3_AGENT_FUNDING_REVERTED' : 'WEB3_AGENT_FUNDING_RECEIPT_INVALID',
      );
      return c.json({
        error: 'fund transfer did not confirm on Arc',
        reference: movement.reference,
        movementState: attention.state,
      }, 502);
    }
    const transfers = parseEventLogs({
      abi: erc20Abi,
      eventName: 'Transfer',
      logs: receipt.logs,
      strict: false,
    });
    const matchingTransfer = transfers.find((entry) =>
      matchesAgentFundingTransfer(entry.args as { from?: string; to?: string; value?: bigint }, {
        sourceAddress: userAddress,
        destinationAddress: agentAddress,
        amountMicros,
      }),
    );
    if (!matchingTransfer || receipt.from.toLowerCase() !== userAddress) {
      return c.json({ error: 'transaction proof does not match this funding intent', code: 'proof_mismatch' }, 409);
    }

    const prepared = await prepareAgentFundingLeg(movement.reference, {
      signerAddress: userAddress,
      sourceAddress: userAddress,
      destinationAddress: agentAddress,
      contractAddress: usdcAddress,
      amountMicros,
    });
    await prepared.lifecycle.onSubmitted?.({ txId: body.txHash, estimatedFee: null });
    await prepared.lifecycle.onConfirmed?.({
      txId: body.txHash,
      txHash: body.txHash,
      explorerUrl: `${config.ARC_TESTNET_EXPLORER_URL}/tx/${body.txHash}`,
    });
    await verifyMoneyMovementLeg(movement.reference, prepared.leg.id, { amountMicros });
    movement = await completeMoneyMovement(movement.reference);
    bus.emitEvent({
      type: 'agent.funded',
      actor: 'platform',
      payload: {
        user: userAddress,
        agent: body.agent,
        agentAddress: agentAddress.toLowerCase(),
        amountUsdc,
        txHash: body.txHash,
        reference: movement.reference,
        movementState: movement.state,
      },
    });
    void appendActivity({
      address: userAddress,
      kind: 'agent_topup',
      summary: `Topped up the ${body.agent} agent wallet with ${amountUsdc} USDC from the connected wallet`,
      params: { t: 'agentTopUp', agent: body.agent, amount: amountUsdc },
      amountUsdc,
      txHash: body.txHash,
      refId: movement.reference,
    });
    return c.json({
      accepted: true,
      txHash: body.txHash,
      agentAddress,
      reference: movement.reference,
      movementState: movement.state,
    }, 200);
  } catch (err) {
    logger.error({ userAddress, agent: body.agent, txHash: body.txHash, err: (err as Error).message }, 'web3 fund completion failed');
    if (movementReference) {
      // The user signed this one themselves and handed us the hash. Whether the
      // money moved is a question the chain answers, and it gets asked before
      // anything here reads as a failed transfer.
      const receipt = await receiptStandingOf(body.txHash);
      const verdict = fundingVerdict({ txHash: body.txHash, receipt });
      const attention = await markMoneyMovementNeedsAttention(
        movementReference,
        verdict === 'landed'
          ? 'WEB3_AGENT_FUNDING_LANDED_UNRECORDED'
          : 'WEB3_AGENT_FUNDING_UNKNOWN_OUTCOME',
      ).catch(() => null);
      if (verdict === 'landed') {
        return c.json({
          error: 'The transfer went through. Karwan is still confirming it.',
          code: 'funding_landed_unrecorded',
          txHash: body.txHash,
          reference: movementReference,
          movementState: attention?.state ?? 'needs_attention',
        }, 202);
      }
      return c.json({
        error:
          verdict === 'did_not_land'
            ? 'The transfer did not go through. Nothing left your wallet.'
            : 'Karwan is still confirming this transfer. Check activity in a moment.',
        code: verdict === 'did_not_land' ? 'funding_failed' : 'funding_unconfirmed',
        txHash: body.txHash,
        reference: movementReference,
        movementState: attention?.state ?? 'needs_attention',
      }, 502);
    }
    return c.json({ error: 'fund transfer completion failed' }, 502);
  }
});


/// Did this transfer actually land on Arc?
///
/// Asked in a catch, so it must never throw its own way out: an RPC that cannot
/// answer means "not known to have landed", which keeps the caller on the
/// cautious path rather than claiming a success it cannot see.
async function receiptStandingOf(txHash: string): Promise<ReceiptStanding> {
  try {
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });
    return receipt.status === 'success' ? 'success' : 'reverted';
  } catch (err) {
    // viem throws the same shape whether the transaction is simply not mined
    // yet and whether the node could not be reached. Neither is a failure, and
    // the verdict treats them the same, so the distinction is kept only for the
    // log line that someone will read later.
    const message = (err as Error).message ?? '';
    return /not be found|not found/i.test(message) ? 'not_found' : 'unreadable';
  }
}

/// Everything known about a funding attempt that threw while being recorded.
async function agentFundingStanding(reference: string, sentTxHash: string | undefined) {
  const movement = await currentMoneyMovement(reference).catch(() => null);
  const leg = movement?.legs.find(
    (candidate) => candidate.attempt === movement.attempt && candidate.key === 'arc_transfer',
  );
  // No hash anywhere means the poll loop gave up before the transaction was
  // mined. Circle still knows: it holds the submission, and its state says
  // whether this will ever land.
  const provider =
    !leg?.txHash && !sentTxHash && leg?.providerId
      ? await getTxState(leg.providerId).catch(() => null)
      : null;
  const txHash = fundingTxHash({
    legTxHash: leg?.txHash,
    sentTxHash,
    providerTxHash: provider?.txHash,
  });
  const receipt: ReceiptStanding = txHash ? await receiptStandingOf(txHash) : 'not_found';
  const verdict = fundingVerdict({ txHash, receipt, providerState: provider?.state });
  return { movement, leg, txHash, receipt, verdict };
}

/// Walk a funding movement to completed against a transaction that landed.
///
/// Uses the same recording path a healthy run uses, rather than writing state
/// by hand, so a recovered movement is indistinguishable from one that never
/// stumbled.
async function recordAgentFundingSuccess(reference: string, legId: string) {
  await verifyMoneyMovementLeg(reference, legId).catch(async (err) => {
    // Already verified is not a failure. Anything else is.
    const after = await currentMoneyMovement(reference);
    const leg = after.legs.find((candidate) => candidate.id === legId);
    if (leg?.state !== 'verified') throw err;
    return after;
  });
  const after = await currentMoneyMovement(reference);
  if (after.state === 'completed') return after;
  return completeMoneyMovement(reference);
}

/// Is each agent bound to the identity wallet that holds the stake?
///
/// The question behind every stake-backed deal. `KarwanEscrow.acceptEscrow`
/// asks the vault for the SELLER AGENT's free stake, and the vault answers about
/// whichever identity that agent resolves to. Unbound, it resolves to itself,
/// reads zero, and the deal cannot activate however much the identity holds.
activationRoutes.get('/agent-binding', async (c) => {
  const address = c.req.query('address');
  if (!address) return c.json({ error: 'address query param required' }, 400);
  const parsed = addrSchema.safeParse(address);
  if (!parsed.success) return c.json({ error: 'invalid address' }, 400);
  if (!isSessionSelf(c, parsed.data)) {
    return c.json({ error: 'You can only read your own wallets.', code: 'forbidden' }, 403);
  }
  const wallets = await getAgentWallets(parsed.data);
  // The vault this backend will send `registerOwner` to, named so the caller
  // signs `approveAgent` against the SAME contract. The two halves are
  // configured separately (backend env, frontend NEXT_PUBLIC with a hardcoded
  // fallback), and a mismatch would leave the user approving on one vault while
  // the registration went to another: AgentNotApproved forever, and identical
  // in every symptom to a binding that simply did not take.
  const vaultAddress = vault.address;
  if (!wallets) return c.json({ activated: false, agents: [], vault: vaultAddress });

  const pairs = [
    { role: 'buyer' as const, agent: wallets.buyerAddress },
    { role: 'seller' as const, agent: wallets.sellerAddress },
  ].filter((pair) => !!pair.agent);

  const agents = await Promise.all(
    pairs.map(async (pair) => {
      try {
        const resolved = (await vault.read.resolveOwner([pair.agent as `0x${string}`])) as string;
        return {
          role: pair.role,
          agent: pair.agent,
          ...bindingStateFor({ agent: pair.agent, resolvedOwner: resolved, identity: parsed.data }),
        };
      } catch (err) {
        // A read that failed is not a binding that exists. Reporting `unbound`
        // offers a signature that is harmless if it turns out to be redundant;
        // reporting bound would hide a deal that cannot activate.
        logger.warn(
          { agent: pair.agent, err: (err as Error).message },
          'agent binding read failed',
        );
        return { role: pair.role, agent: pair.agent, kind: 'unbound' as const };
      }
    }),
  );
  return c.json({ activated: true, agents, vault: vaultAddress });
});

/// Finish the handshake, after the identity has approved its agents.
///
/// Step two only: `registerOwner` is sent BY each agent wallet, which the
/// backend holds. Step one is `approveAgent`, sent by the identity, and for a
/// connected wallet that signature is the user's to give: the vault reads
/// msg.sender as the owner granting consent, and consent the backend could forge
/// would not be consent. An email account's identity is a wallet the backend
/// signs with, so both steps run here for them.
activationRoutes.post('/agent-binding/register', async (c) => {
  let body;
  try {
    body = z.object({ address: addrSchema }).parse(await c.req.json());
  } catch (err) {
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  if (!isSessionSelf(c, body.address)) {
    return c.json({ error: 'You can only bind your own agents.', code: 'forbidden' }, 403);
  }
  const wallets = await getAgentWallets(body.address);
  if (!wallets) return c.json({ error: 'activate your agents first' }, 409);

  // An email or passkey account's identity IS a wallet the backend signs with,
  // so step one is ours to send for them and the whole handshake completes in
  // this one call. A connected wallet's approval is the user's signature, sent
  // before they get here; there is nothing to do for them at this point.
  const identityWalletId = getUserByAddress(body.address)?.circleIdentityWalletId;
  if (identityWalletId) {
    for (const agent of [wallets.sellerAddress, wallets.buyerAddress]) {
      if (!agent) continue;
      try {
        await executeContractCall(
          {
            walletId: identityWalletId,
            contractAddress: vault.address,
            abiFunctionSignature: 'approveAgent(address)',
            abiParameters: [agent],
          },
          `vault.approveAgent(${agent})`,
        );
      } catch (err) {
        // Approving twice is harmless (the mapping is a set), so a failure here
        // is worth a line but never worth stopping: registerOwner below is the
        // step that reports whether the pair actually bound.
        logger.warn(
          { agent, err: (err as Error).message },
          'identity approveAgent failed; registerOwner will report the outcome',
        );
      }
    }
  }

  const results: Array<{ role: string; agent: string; bound: boolean; reason?: string }> = [];
  for (const pair of [
    { role: 'seller' as const, walletId: wallets.sellerWalletId, agent: wallets.sellerAddress },
    { role: 'buyer' as const, walletId: wallets.buyerWalletId, agent: wallets.buyerAddress },
  ]) {
    if (!pair.walletId || !pair.agent) continue;
    try {
      await executeContractCall(
        {
          walletId: pair.walletId,
          contractAddress: vault.address,
          abiFunctionSignature: 'registerOwner(address)',
          abiParameters: [body.address],
        },
        `vault.registerOwner(${pair.role} ${pair.agent})`,
      );
      results.push({ role: pair.role, agent: pair.agent, bound: true });
    } catch (err) {
      const message = (err as Error).message.toLowerCase();
      // Already bound is success: the handshake is idempotent and a retry after
      // a partial run must not read as a failure.
      if (message.includes('agentowneralreadyset')) {
        results.push({ role: pair.role, agent: pair.agent, bound: true });
        continue;
      }
      const notApproved = message.includes('agentnotapproved');
      logger.error(
        { role: pair.role, agent: pair.agent, err: (err as Error).message },
        'agent binding registration failed',
      );
      results.push({
        role: pair.role,
        agent: pair.agent,
        bound: false,
        // Named, because it is the difference between "sign the approval" and
        // "something is wrong". An unapproved agent means step one has not
        // landed yet, which on a connected wallet is the user's transaction.
        reason: notApproved ? 'not_approved' : 'failed',
      });
    }
  }
  const bound = results.every((result) => result.bound);
  return c.json({ bound, agents: results }, bound ? 200 : 409);
});

/// Move a starter USDC seed from the user's identity wallet to each freshly
/// Registers the agent → identity binding on KarwanVault. Lets the seller's
/// acceptEscrow resolve the agent (msg.sender) to its identity wallet, where
/// stake actually lives. Fire-and-forget; never blocks activation.
async function registerAgentOwnerOnVault(
  walletId: string | undefined,
  agentAddress: string,
  userAddress: string,
  role: 'buyer' | 'seller',
): Promise<'bound' | 'needs_owner' | 'failed'> {
  if (!walletId) return 'failed';
  try {
    await executeContractCall(
      {
        walletId,
        contractAddress: vault.address,
        abiFunctionSignature: 'registerOwner(address)',
        abiParameters: [userAddress],
      },
      `vault.registerOwner(${role} ${agentAddress})`,
    );
    logger.info({ role, agent: agentAddress, owner: userAddress }, 'agent owner registered on vault');
    return 'bound';
  } catch (err) {
    const msg = (err as Error).message;
    const lower = msg.toLowerCase();
    if (lower.includes('agentowneralreadyset')) {
      logger.info({ role, agent: agentAddress }, 'agent owner already registered (idempotent)');
      return 'bound';
    }
    // The owner has not approved this agent yet, which for a connected wallet is
    // the normal state at activation: their approval is a signature only they
    // can give, and they give it on /stake. Not a failure, and it must not be
    // logged as one or the real failures below become invisible.
    if (lower.includes('agentnotapproved')) {
      logger.info(
        { role, agent: agentAddress, owner: userAddress },
        'agent binding waiting on the owner\'s approval',
      );
      return 'needs_owner';
    }
    // Anything else IS a failure, and it used to be a warn that nobody read.
    // An unbound agent is a stake-backed deal that will fail at acceptEscrow,
    // long after this line, with an error that names none of this.
    logger.error(
      { role, agent: agentAddress, owner: userAddress, err: msg },
      'agent binding failed; stake-backed deals for this agent cannot activate',
    );
    return 'failed';
  }
}

/// Bind both agents at activation, doing the owner's half too when we can.
///
/// An email or passkey account's identity is a wallet the backend signs with,
/// so `approveAgent` is ours to send and the pair binds here and now. A
/// connected wallet's approval is the user's signature; their agents stay
/// unbound until /stake, which the binding card there exists to fix.
async function bindAgentsAtActivation(
  userAddress: string,
  record: {
    buyerWalletId?: string;
    sellerWalletId?: string;
    buyerAddress: string;
    sellerAddress: string;
  },
): Promise<void> {
  const identityWalletId = getUserByAddress(userAddress)?.circleIdentityWalletId;
  const pairs = [
    { role: 'seller' as const, walletId: record.sellerWalletId, agent: record.sellerAddress },
    { role: 'buyer' as const, walletId: record.buyerWalletId, agent: record.buyerAddress },
  ];

  for (const pair of pairs) {
    if (!pair.agent) continue;
    if (identityWalletId) {
      try {
        await executeContractCall(
          {
            walletId: identityWalletId,
            contractAddress: vault.address,
            abiFunctionSignature: 'approveAgent(address)',
            abiParameters: [pair.agent],
          },
          `vault.approveAgent(${pair.role} ${pair.agent})`,
        );
      } catch (err) {
        logger.error(
          { role: pair.role, agent: pair.agent, err: (err as Error).message },
          'identity could not approve its agent; the binding below will not complete',
        );
      }
    }
    await registerAgentOwnerOnVault(pair.walletId, pair.agent, userAddress, pair.role);
  }
}

/// provisioned agent so both can act immediately: the seller agent needs a small
/// Arc gas float, the buyer agent needs working USDC. Identity stays the funding
/// hub; bigger top-ups still flow through fund-agent. Circle users only (web3
/// users have no server-side identity wallet). Best-effort and fire-and-forget:
/// never blocks activation, swallows insufficient-balance / transient errors.
async function seedAgentsFromIdentity(
  userAddress: string,
  record: { buyerAddress: string; sellerAddress: string },
): Promise<void> {
  const user = getUserByAddress(userAddress);
  if (!user?.circleIdentityWalletId) return; // web3 user: no server-side wallet

  let available = 0;
  try {
    available = Number(formatUnits(await readUsdcBalance(userAddress), USDC_DECIMALS));
  } catch (err) {
    logger.warn(
      { userAddress, err: (err as Error).message },
      'agent seed skipped: identity balance read failed',
    );
    return;
  }
  if (available <= 0.5) return; // nothing meaningful to seed; user funds later

  // Cap each seed to a share of the balance so the hub keeps a reserve.
  const sellerSeed = Math.min(SELLER_SEED_USDC, available * 0.15);
  const buyerSeed = Math.min(BUYER_SEED_USDC, available * 0.6);

  // Sequential, not parallel: one Circle DCW serializes tx nonces, so two
  // concurrent transfers from the identity wallet would collide.
  await transferFromIdentity(user.circleIdentityWalletId, record.sellerAddress, sellerSeed, userAddress, 'seller');
  await transferFromIdentity(user.circleIdentityWalletId, record.buyerAddress, buyerSeed, userAddress, 'buyer');
}

async function transferFromIdentity(
  identityWalletId: string,
  toAddress: string,
  amountUsdc: number,
  userAddress: string,
  agent: 'buyer' | 'seller',
): Promise<void> {
  if (amountUsdc < 0.5) return; // skip dust transfers
  let movementReference: string | undefined;
  try {
    const amountWei = parseUnits(amountUsdc.toFixed(USDC_DECIMALS), USDC_DECIMALS);
    const amountLabel = amountUsdc.toFixed(USDC_DECIMALS);
    const { movement } = await ensureAgentFundingMovement({
      operationKey: `agent-seed:identity-to-agent:${userAddress}:${agent}:${amountLabel}`,
      amountUsdc: amountLabel,
      initiatedBy: userAddress,
      sourceAddress: userAddress,
      destinationAddress: toAddress,
      summary: `Seeded the ${agent} agent wallet with ${amountLabel} USDC from the identity wallet`,
    });
    movementReference = movement.reference;
    const current = await currentMoneyMovement(movement.reference);
    const existingLeg = current.legs.find(
      (leg) => leg.attempt === current.attempt && leg.key === 'arc_transfer',
    );
    if (current.state === 'completed' && existingLeg?.txHash) {
      logger.info(
        { userAddress, agent, amountUsdc, txHash: existingLeg.txHash, reference: current.reference },
        'agent seed already recorded',
      );
      return;
    }
    if (current.state === 'needs_attention') {
      logger.warn(
        { userAddress, agent, amountUsdc, reference: current.reference },
        'agent seed needs attention; refusing blind retry',
      );
      return;
    }
    const prepared = await prepareAgentFundingLeg(movement.reference, {
      walletId: identityWalletId,
      signerAddress: userAddress,
      sourceAddress: userAddress,
      destinationAddress: toAddress,
      contractAddress: usdcAddress,
      amountMicros: amountWei,
    });
    const result = await executeContractCall(
      {
        walletId: identityWalletId,
        contractAddress: usdcAddress,
        abiFunctionSignature: 'transfer(address,uint256)',
        abiParameters: [toAddress, amountWei.toString()],
        idempotencyKey: prepared.idempotencyKey,
        lifecycle: prepared.lifecycle,
      },
      `seed-agent(${agent} <- identity ${userAddress})`,
    );
    const verified = await verifyMoneyMovementLeg(movement.reference, prepared.leg.id);
    const completed = await completeMoneyMovement(verified.reference);
    bus.emitEvent({
      type: 'agent.funded',
      actor: 'platform',
      payload: {
        user: userAddress,
        agent,
        agentAddress: toAddress.toLowerCase(),
        amountUsdc: amountUsdc.toString(),
        txHash: result.txHash,
        reference: completed.reference,
        movementState: completed.state,
        seed: true,
      },
    });
    void appendActivity({
      address: userAddress,
      kind: 'agent_seed',
      summary: `Moved ${amountUsdc} USDC from your wallet into your ${agent} agent at setup`,
      params: {t: 'setupMove', agent: String(agent), amount: String(amountUsdc)},
      amountUsdc: amountUsdc.toString(),
      txHash: result.txHash,
      refId: completed.reference,
    });
    logger.info(
      { userAddress, agent, amountUsdc, txHash: result.txHash, reference: completed.reference },
      'agent seeded from identity',
    );
  } catch (err) {
    if (movementReference) {
      await markMoneyMovementNeedsAttention(movementReference, 'AGENT_SEED_UNKNOWN_OUTCOME').catch(() => null);
    }
    logger.warn(
      { userAddress, agent, reference: movementReference, err: (err as Error).message },
      'agent seed transfer failed (non-fatal)',
    );
  }
}
