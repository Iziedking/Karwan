import { Hono } from 'hono';
import { z } from 'zod';
import { parseUnits, formatUnits } from 'viem';
import {
  provisionUserAgentWallets,
  provisionUserBridgeWallet,
  dripTestnetUsdc,
  BASE_SEPOLIA_BLOCKCHAIN,
} from '../circle/wallets.js';
import { CCTP_CHAINS, CCTP_CHAIN_KEYS } from '../chain/cctpChains.js';
import {
  getAgentWallets,
  saveAgentWallets,
  updateAgentNames,
  type AgentWallets,
} from '../db/agentWallets.js';
import { getUserByAddress } from '../db/users.js';
import { sessionMismatchesClaim } from '../auth/session.js';
import { usdc as usdcAddress, readUsdcBalance } from '../chain/contracts.js';
import { executeContractCall } from '../chain/txs.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';

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
});

const fundAgentSchema = z.object({
  address: addrSchema,
  agent: z.enum(['buyer', 'seller']),
  amountUsdc: z.number().positive(),
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
activationRoutes.get('/wallets', async (c) => {
  const address = c.req.query('address');
  if (!address || !addrSchema.safeParse(address).success) {
    return c.json({ error: 'address query param required' }, 400);
  }
  const addr = address.toLowerCase();

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

  return c.json({
    identity: { address: addr, usdcBalance: identityUsdc },
    agents,
    bridgeWallets: wallets?.bridgeWallets ?? {},
  });
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
activationRoutes.post('/drip-bridge', async (c) => {
  let body;
  try {
    body = dripBridgeSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  const userAddress = body.address.toLowerCase();
  const blockchain = CCTP_CHAINS[body.chain ?? 'baseSepolia'].circleBlockchain;
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
activationRoutes.post('/faucet', async (c) => {
  let body;
  try {
    body = faucetSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
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
activationRoutes.post('/fund-source', async (c) => {
  let body;
  try {
    body = fundSourceSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  const blockchain = CCTP_CHAINS[body.chain].circleBlockchain;
  const drip = await dripTestnetUsdc(body.address.toLowerCase(), {
    blockchain,
    native: false,
    usdc: true,
  });
  if (!drip.ok) {
    // The faucet caps ~20 USDC per address, per chain, per 2h, plus per-key/IP
    // limits. Over-quota comes back as 429 or a 403 {"code":3,"message":
    // "Forbidden"} — map both to one clear line instead of leaking raw JSON.
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
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  const userAddress = body.address.toLowerCase();

  const existing = await getAgentWallets(userAddress);
  if (existing) {
    // Already activated: idempotent. Name changes go through /agent-names, not a
    // repeat activate, so we don't disturb existing names here.
    return c.json({ activated: true, agents: agentsPayload(existing) });
  }

  if (inFlight.has(userAddress)) {
    return c.json({ error: 'activation already in progress' }, 409);
  }

  inFlight.add(userAddress);
  try {
    const provisioned = await provisionUserAgentWallets(userAddress);

    // Provision the common testnet bridge wallet (Base Sepolia) alongside the
    // agents. Lets Circle-auth users bridge USDC into Arc without bringing a
    // web3 wallet. Ethereum Sepolia is lazy-provisioned the first time the
    // user picks it as a bridge source (most users never will).
    let bridgeWallets: Record<string, { walletId: string; address: string }> = {};
    try {
      const baseBridge = await provisionUserBridgeWallet(userAddress, BASE_SEPOLIA_BLOCKCHAIN);
      bridgeWallets = {
        [BASE_SEPOLIA_BLOCKCHAIN]: { walletId: baseBridge.walletId, address: baseBridge.address },
      };
    } catch (err) {
      // Bridge-wallet provisioning is not load-bearing for activation; if
      // Circle rejects (rate limit, transient), agents still ship. Bridge
      // wallets lazy-provision on first /circle-bridge call.
      logger.warn(
        { userAddress, err: (err as Error).message },
        'base-sepolia bridge wallet provisioning failed during activation; will lazy-provision later',
      );
    }

    const record = await saveAgentWallets({
      userAddress,
      ...provisioned,
      bridgeWallets,
      buyerName: cleanName(body.buyerName),
      sellerName: cleanName(body.sellerName),
    });

    // Seed both agents from the identity wallet (the one funded at signup), not
    // the faucet: a user may be buyer-only or seller-only, and the identity
    // wallet is the single funding hub. Seller gets a small Arc gas float, buyer
    // gets working USDC. Fire-and-forget, Circle users only. See seedAgentsFromIdentity.
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
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  if (sessionMismatchesClaim(c, body.address)) {
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
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  const userAddress = body.address.toLowerCase();

  const wallets = await getAgentWallets(userAddress);
  if (!wallets) {
    return c.json({ error: 'no agent wallets for this address' }, 409);
  }
  const walletId =
    body.agent === 'buyer' ? wallets.buyerWalletId : wallets.sellerWalletId;
  const agentAddress =
    body.agent === 'buyer' ? wallets.buyerAddress : wallets.sellerAddress;

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
  try {
    const result = await executeContractCall(
      {
        walletId,
        contractAddress: usdcAddress,
        abiFunctionSignature: 'transfer(address,uint256)',
        abiParameters: [body.toAddress, amountWei.toString()],
      },
      `withdraw(${body.agent} agent -> ${body.toAddress})`,
    );
    bus.emitEvent({
      type: 'agent.withdrawal',
      actor: 'platform',
      payload: {
        user: userAddress,
        agent: body.agent,
        toAddress: body.toAddress.toLowerCase(),
        amountUsdc: body.amountUsdc.toString(),
        txHash: result.txHash,
      },
    });
    logger.info(
      { userAddress, agent: body.agent, toAddress: body.toAddress, txHash: result.txHash },
      'agent wallet withdrawal sent',
    );
    return c.json({ accepted: true, txHash: result.txHash }, 200);
  } catch (err) {
    logger.error({ userAddress, err: (err as Error).message }, 'withdrawal failed');
    return c.json({ error: 'withdrawal failed', detail: (err as Error).message }, 502);
  } finally {
    withdrawInFlight.delete(key);
  }
});

/// Tops up an agent wallet from the user's Circle identity DCW. Only available
/// to Circle-auth users — web3 users have no server-side wallet for us to sign
/// from, so they take the existing wagmi path on the frontend.
///
/// Both legs are Circle DCWs the backend already controls, so no user signature
/// is required and gas is sponsored by Circle. A one-click transfer.
activationRoutes.post('/fund-agent', async (c) => {
  let body;
  try {
    body = fundAgentSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  const userAddress = body.address.toLowerCase();

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
  try {
    const amountWei = parseUnits(body.amountUsdc.toString(), USDC_DECIMALS);
    const result = await executeContractCall(
      {
        walletId: user.circleIdentityWalletId,
        contractAddress: usdcAddress,
        abiFunctionSignature: 'transfer(address,uint256)',
        abiParameters: [agentAddress, amountWei.toString()],
      },
      `fund-agent(${body.agent} <- identity ${userAddress})`,
    );
    bus.emitEvent({
      type: 'agent.funded',
      actor: 'platform',
      payload: {
        user: userAddress,
        agent: body.agent,
        agentAddress: agentAddress.toLowerCase(),
        amountUsdc: body.amountUsdc.toString(),
        txHash: result.txHash,
      },
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
    return c.json({ accepted: true, txHash: result.txHash, agentAddress }, 200);
  } catch (err) {
    logger.error(
      { userAddress, agent: body.agent, err: (err as Error).message },
      'fund-agent failed',
    );
    return c.json({ error: 'fund-agent failed', detail: (err as Error).message }, 502);
  } finally {
    fundInFlight.delete(key);
  }
});

/// Move a starter USDC seed from the user's identity wallet to each freshly
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
  try {
    const amountWei = parseUnits(amountUsdc.toFixed(USDC_DECIMALS), USDC_DECIMALS);
    const result = await executeContractCall(
      {
        walletId: identityWalletId,
        contractAddress: usdcAddress,
        abiFunctionSignature: 'transfer(address,uint256)',
        abiParameters: [toAddress, amountWei.toString()],
      },
      `seed-agent(${agent} <- identity ${userAddress})`,
    );
    bus.emitEvent({
      type: 'agent.funded',
      actor: 'platform',
      payload: {
        user: userAddress,
        agent,
        agentAddress: toAddress.toLowerCase(),
        amountUsdc: amountUsdc.toString(),
        txHash: result.txHash,
        seed: true,
      },
    });
    logger.info({ userAddress, agent, amountUsdc, txHash: result.txHash }, 'agent seeded from identity');
  } catch (err) {
    logger.warn(
      { userAddress, agent, err: (err as Error).message },
      'agent seed transfer failed (non-fatal)',
    );
  }
}
