import { Hono } from 'hono';
import { z } from 'zod';
import { parseUnits } from 'viem';
import {
  provisionUserAgentWallets,
  provisionUserBridgeWallet,
  BASE_SEPOLIA_BLOCKCHAIN,
} from '../circle/wallets.js';
import { getAgentWallets, saveAgentWallets } from '../db/agentWallets.js';
import { getUserByAddress } from '../db/users.js';
import { usdc as usdcAddress } from '../chain/contracts.js';
import { executeContractCall } from '../chain/txs.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';

// USDC on Arc exposes a 6-decimal ERC-20 interface. Withdrawals move funds
// through that interface, the same one the escrow uses.
const USDC_DECIMALS = 6;

const addrSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'expected 0x-prefixed 20-byte hex address');

const activateSchema = z.object({ address: addrSchema });

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
    agents: {
      buyer: wallets.buyerAddress,
      seller: wallets.sellerAddress,
    },
    bridgeWallets: wallets.bridgeWallets ?? {},
  });
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
    return c.json({
      activated: true,
      agents: { buyer: existing.buyerAddress, seller: existing.sellerAddress },
    });
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

    const record = await saveAgentWallets({ userAddress, ...provisioned, bridgeWallets });
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
      agents: { buyer: record.buyerAddress, seller: record.sellerAddress },
      bridgeWallets: record.bridgeWallets ?? {},
    });
  } catch (err) {
    logger.error({ userAddress, err: (err as Error).message }, 'activation failed');
    return c.json({ error: 'activation failed', detail: (err as Error).message }, 502);
  } finally {
    inFlight.delete(userAddress);
  }
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

  const key = `${userAddress}:${body.agent}`;
  if (withdrawInFlight.has(key)) {
    return c.json({ error: 'a withdrawal is already in progress for this agent' }, 409);
  }

  withdrawInFlight.add(key);
  try {
    const amountWei = parseUnits(body.amountUsdc.toString(), USDC_DECIMALS);
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
