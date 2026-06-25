import { BatchEvmScheme } from '@circle-fin/x402-batching/client';
import type { Address } from 'viem';
import { dcwEvmSigner } from './dcwSigner.js';
import { executeContractCall } from '../chain/txs.js';
import { circleWalletsClient, ARC_TESTNET_BLOCKCHAIN } from '../circle/wallets.js';
import {
  updateX402Wallet,
  findAgentWalletByAgentAddress,
  type AgentWallets,
} from '../db/agentWallets.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

/// Buyer-side x402 client (Path A: same-chain self-pay on Arc Testnet).
/// The buyer agent pays Karwan's own paid endpoints during bid scoring,
/// moving real USDC from the agent's Gateway deposit to the platform
/// treasury through Circle's batched settlement.
///
/// Wallet model: the agent wallets are SCAs, and Gateway only accepts EOA
/// signatures on payment authorizations. Each user gets a lazily-provisioned
/// x402 EOA; the buyer agent SCA funds its Gateway deposit via depositFor,
/// and the EOA signs the EIP-3009 authorizations.

const GATEWAY_API = 'https://gateway-api-testnet.circle.com/v1';
const ARC_NETWORK = 'eip155:5042002';
const ARC_GATEWAY_DOMAIN = 26;
const GATEWAY_WALLET_ADDR = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9';
const USDC_DECIMALS = 6;

export interface X402WalletRef {
  walletId: string;
  address: string;
}

/// In-flight provisioning guard so two concurrent bids for the same user
/// don't create two x402 wallets.
const provisioning = new Map<string, Promise<X402WalletRef>>();

async function provisionX402Wallet(userAddress: string): Promise<X402WalletRef> {
  if (!config.CIRCLE_WALLET_SET_ID) {
    throw new Error('CIRCLE_WALLET_SET_ID is not set');
  }
  const client = circleWalletsClient();
  const res = await client.createWallets({
    blockchains: [ARC_TESTNET_BLOCKCHAIN],
    count: 1,
    walletSetId: config.CIRCLE_WALLET_SET_ID,
    // EOA on purpose: Gateway rejects EIP-1271 signatures, so the signer
    // must recover via plain ecrecover.
    accountType: 'EOA',
    metadata: [{ name: 'karwan-x402-payer', refId: userAddress.toLowerCase() }],
  });
  const wallet = res.data?.wallets?.[0];
  if (!wallet?.id || !wallet.address) {
    throw new Error('x402 wallet provisioning returned incomplete data');
  }
  const ref = { walletId: wallet.id, address: wallet.address.toLowerCase() };
  await updateX402Wallet(userAddress, ref);
  logger.info({ userAddress, x402Address: ref.address }, 'x402: payer EOA provisioned');
  return ref;
}

export async function ensureX402Wallet(record: AgentWallets): Promise<X402WalletRef> {
  if (record.x402Wallet) return record.x402Wallet;
  const key = record.userAddress;
  let pending = provisioning.get(key);
  if (!pending) {
    pending = provisionX402Wallet(key).finally(() => provisioning.delete(key));
    provisioning.set(key, pending);
  }
  return pending;
}

/// Available Gateway balance (USD) for a depositor on Arc Testnet. Gateway
/// returns no row for an address that never deposited; treat that as zero.
export async function gatewayAvailableUsd(depositor: string): Promise<number> {
  const res = await fetch(`${GATEWAY_API}/balances`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: 'USDC',
      sources: [{ depositor, domain: ARC_GATEWAY_DOMAIN }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Gateway balance fetch failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  const data = (await res.json()) as { balances?: Array<{ balance?: string }> };
  return Number(data.balances?.[0]?.balance ?? 0);
}

/// Top up the x402 EOA's Gateway deposit from the buyer agent SCA when the
/// available balance can't cover the next call. One approve + one depositFor,
/// both signed by the agent SCA on Arc (fast path). The deposit needs Arc
/// block finality before Gateway credits it, so the first paid call after a
/// fresh deposit may still see a low balance; callers retry on the next bid.
export async function ensureGatewayFunding(
  record: AgentWallets,
  x402: X402WalletRef,
  neededUsd: number,
): Promise<{ funded: boolean; availableUsd: number }> {
  const availableUsd = await gatewayAvailableUsd(x402.address);
  if (availableUsd >= neededUsd) return { funded: true, availableUsd };

  const depositUsd = Math.max(config.X402_GATEWAY_DEPOSIT_USD, neededUsd);
  const amountAtomic = BigInt(Math.round(depositUsd * 10 ** USDC_DECIMALS));
  logger.info(
    { user: record.userAddress, x402Address: x402.address, depositUsd, availableUsd },
    'x402: funding Gateway deposit from buyer agent wallet',
  );
  await executeContractCall(
    {
      walletId: record.buyerWalletId,
      contractAddress: config.USDC_ADDR,
      abiFunctionSignature: 'approve(address,uint256)',
      abiParameters: [GATEWAY_WALLET_ADDR, amountAtomic.toString()],
    },
    'x402.gateway.approve',
  );
  await executeContractCall(
    {
      walletId: record.buyerWalletId,
      contractAddress: GATEWAY_WALLET_ADDR,
      abiFunctionSignature: 'depositFor(address,address,uint256)',
      abiParameters: [config.USDC_ADDR, x402.address, amountAtomic.toString()],
    },
    'x402.gateway.depositFor',
  );
  // The deposit tx confirmed, but Gateway credits it only after finality.
  // Report the pre-deposit availability honestly; the caller decides whether
  // to attempt the payment now or pick it up on a later bid.
  const after = await gatewayAvailableUsd(x402.address).catch(() => availableUsd);
  return { funded: after >= neededUsd, availableUsd: after };
}

interface PaymentOption {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: Record<string, unknown>;
}

export interface X402PayResult<T> {
  data: T;
  amountUsd: number;
  payer: string;
  transaction: string;
}

/// Full x402 round-trip against one URL: initial request, parse the
/// PAYMENT-REQUIRED offer, sign the Arc batching option with the x402 EOA,
/// retry with Payment-Signature, read the settlement out of PAYMENT-RESPONSE.
export async function payX402<T = unknown>(
  url: string,
  x402: X402WalletRef,
): Promise<X402PayResult<T>> {
  const first = await fetch(url);
  if (first.status !== 402) {
    if (first.ok) {
      return { data: (await first.json()) as T, amountUsd: 0, payer: '', transaction: '' };
    }
    throw new Error(`x402 request failed (${first.status})`);
  }

  const offerHeader = first.headers.get('PAYMENT-REQUIRED');
  if (!offerHeader) throw new Error('402 without PAYMENT-REQUIRED header');
  const offer = JSON.parse(Buffer.from(offerHeader, 'base64').toString('utf-8')) as {
    x402Version?: number;
    accepts?: PaymentOption[];
  };
  const option = offer.accepts?.find(
    (o) =>
      o.network === ARC_NETWORK &&
      o.extra?.name === 'GatewayWalletBatched' &&
      typeof o.extra?.verifyingContract === 'string',
  );
  if (!option) throw new Error(`no Gateway batching option for ${ARC_NETWORK}`);

  const scheme = new BatchEvmScheme(dcwEvmSigner(x402.walletId, x402.address as Address));
  const payload = await scheme.createPaymentPayload(offer.x402Version ?? 2, option);
  const paid = await fetch(url, {
    headers: {
      'Payment-Signature': Buffer.from(
        JSON.stringify({ ...payload, accepted: option }),
      ).toString('base64'),
    },
  });
  if (!paid.ok) {
    const body = (await paid.json().catch(() => ({}))) as { error?: string; reason?: string };
    throw new Error(
      `x402 payment failed (${paid.status}): ${body.error ?? ''} ${body.reason ?? ''}`.trim(),
    );
  }

  let transaction = '';
  const responseHeader = paid.headers.get('PAYMENT-RESPONSE');
  if (responseHeader) {
    const settle = JSON.parse(Buffer.from(responseHeader, 'base64').toString('utf-8')) as {
      transaction?: string;
    };
    transaction = settle.transaction ?? '';
  }
  return {
    data: (await paid.json()) as T,
    amountUsd: Number(option.amount) / 10 ** USDC_DECIMALS,
    payer: x402.address,
    transaction,
  };
}

export interface PaidPassportSignal {
  subject: string;
  tier: string;
  score: number;
  concentrationRatio?: number;
  concentrationHard?: boolean;
  /// Settled-deal performance the free passport page does not expose. The
  /// granular evidence the paid pull buys over a bare score: how many deals
  /// settled, how they ended, lifetime volume, and the derived completion rate.
  successCount?: number;
  disputedCount?: number;
  failedCount?: number;
  lifetimeVolumeUsdc?: number;
  /// Clean / (clean + disputed + failed), as a 0-100 percentage. Null when the
  /// subject has no terminal deals yet.
  completionRate?: number | null;
  amountUsd: number;
  payer: string;
  transaction: string;
  paidAt: number;
}

const CREDIT_PASSPORT_PRICE_USD = 0.01;

/// A paid credit-passport pull, by either side, on its counterparty. The
/// paying agent funds the call from its own Gateway deposit, so the buyer pulls
/// the seller before scoring and the seller pulls the buyer before pricing
/// through the same path. Resolves the payer's owner record, makes sure its
/// x402 EOA exists and its Gateway deposit covers the call, then pays Karwan's
/// own endpoint over real x402. Captures the settled-deal counts and volume the
/// endpoint returns (which the free passport page does not), and derives a
/// completion rate. Throws on any failure; callers treat the signal as
/// best-effort.
export async function paidCreditPassport(
  payerAgentAddress: string,
  subjectAddress: string,
): Promise<PaidPassportSignal> {
  const record = await findAgentWalletByAgentAddress(payerAgentAddress);
  if (!record) throw new Error('no agent wallet record behind the paying agent');

  const x402 = await ensureX402Wallet(record);
  const funding = await ensureGatewayFunding(record, x402, CREDIT_PASSPORT_PRICE_USD);
  if (!funding.funded) {
    throw new Error(
      `Gateway deposit not yet credited (available ${funding.availableUsd} USDC); retrying on a later bid`,
    );
  }

  const base = `http://127.0.0.1:${config.PORT}`;
  const result = await payX402<{
    address: string;
    tier: string;
    score: number;
    concentrationRatio?: number;
    concentrationHard?: boolean;
    successCount?: number;
    disputedCount?: number;
    failedCount?: number;
    lifetimeVolumeUsdc?: number;
  }>(`${base}/api/x402/credit-passport/${subjectAddress}`, x402);

  const d = result.data;
  const terminal =
    (d.successCount ?? 0) + (d.disputedCount ?? 0) + (d.failedCount ?? 0);
  const completionRate =
    terminal > 0 ? Math.round(((d.successCount ?? 0) / terminal) * 100) : null;

  return {
    subject: d.address,
    tier: d.tier,
    score: d.score,
    concentrationRatio: d.concentrationRatio,
    concentrationHard: d.concentrationHard,
    successCount: d.successCount,
    disputedCount: d.disputedCount,
    failedCount: d.failedCount,
    lifetimeVolumeUsdc: d.lifetimeVolumeUsdc,
    completionRate,
    amountUsd: result.amountUsd,
    payer: result.payer,
    transaction: result.transaction,
    paidAt: Date.now(),
  };
}
