import { privateKeyToAccount } from 'viem/accounts';
import { x402Client, x402HTTPClient } from '@x402/core/client';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { config } from '../config.js';
import { logger } from '../logger.js';

/// Buyer Path B: the agent pays EXTERNAL x402 endpoints on Base mainnet
/// for data nobody on the platform has. These sellers use the standard
/// x402 exact-EVM scheme (EIP-3009 signed against Base USDC's own domain,
/// "USD Coin"/"2"), NOT Gateway batching. Verified from the live 402
/// response. So the payer is a plain EOA whose key lives in env: it only
/// ever signs; the seller's facilitator submits on chain and pays gas.
/// Funding is just USDC sitting in the payer's wallet. No deposit, no ETH.

let httpClient: x402HTTPClient | null = null;
let payerAddress = '';

function ensureClient(): x402HTTPClient {
  if (httpClient) return httpClient;
  const pk = config.X402_BASE_PRIVATE_KEY;
  if (!pk) throw new Error('X402_BASE_PRIVATE_KEY is not configured');
  const account = privateKeyToAccount(pk as `0x${string}`);
  payerAddress = account.address.toLowerCase();
  const client = new x402Client();
  registerExactEvmScheme(client, { signer: account });
  httpClient = new x402HTTPClient(client);
  logger.info({ payer: payerAddress }, 'x402: external payer initialised');
  return httpClient;
}

/// The payer address (for funding + audit). Empty string until the first
/// paid call initialises the client.
export function externalPayerAddress(): string {
  if (!payerAddress && config.X402_BASE_PRIVATE_KEY) ensureClient();
  return payerAddress;
}

export interface ExternalPayResult<T> {
  data: T;
  paidUsd: number;
  payer: string;
  /// The on-chain settlement tx hash, decoded from the x402 `X-PAYMENT-RESPONSE`
  /// header the resource server returns after its facilitator submits. Absent
  /// when the server doesn't echo it; callers fall back to the payer address.
  txHash?: string;
}

/// Full x402 round-trip against an external endpoint: initial request,
/// 402 negotiation via the standard @x402/core client, signed retry.
export async function payExternal<T = unknown>(url: string): Promise<ExternalPayResult<T>> {
  const first = await fetch(url);
  if (first.ok) {
    return { data: (await first.json()) as T, paidUsd: 0, payer: '' };
  }
  if (first.status !== 402) {
    throw new Error(`external x402 request failed (${first.status})`);
  }

  const http = ensureClient();
  const body = await first.json().catch(() => undefined);
  const paymentRequired = http.getPaymentRequiredResponse(
    (name) => first.headers.get(name),
    body,
  );
  const payload = await http.createPaymentPayload(paymentRequired);
  const headers = http.encodePaymentSignatureHeader(payload);

  const paid = await fetch(url, { headers });
  if (!paid.ok) {
    const detail = await paid.text().catch(() => paid.statusText);
    throw new Error(`external x402 payment failed (${paid.status}): ${detail.slice(0, 300)}`);
  }

  // Price comes from the server's offer, atomic USDC at 6 decimals.
  const accepts = (paymentRequired as { accepts?: Array<{ amount?: string }> }).accepts;
  const paidUsd = Number(accepts?.[0]?.amount ?? 0) / 1e6;

  // Settlement evidence: the server echoes the on-chain tx in the standard
  // x402 X-PAYMENT-RESPONSE header (base64 JSON). Best-effort; the screen still
  // works without it.
  let txHash: string | undefined;
  try {
    const settle = paid.headers.get('x-payment-response');
    if (settle) {
      const decoded = JSON.parse(Buffer.from(settle, 'base64').toString('utf8')) as {
        transaction?: string;
        txHash?: string;
      };
      const tx = decoded.transaction ?? decoded.txHash;
      if (tx && /^0x[a-fA-F0-9]{64}$/.test(tx)) txHash = tx;
    }
  } catch {
    /* no settlement header; evidence falls back to the payer address */
  }

  return { data: (await paid.json()) as T, paidUsd, payer: payerAddress, txHash };
}

// Counterparty screening (GlobalAPI)

/// GlobalAPI unified counterparty check: OFAC SDN + UK FCDO + UN SC
/// sanctions, wallet age, mixer/exploit labels, activity, one call,
/// PASS / WARN / BLOCK verdict. $0.01 per call on Base mainnet.
const COUNTERPARTY_CHECK_URL = 'https://globalapi.dev/compliance/counterparty';

export interface CounterpartyScreen {
  address: string;
  verdict: 'PASS' | 'WARN' | 'BLOCK';
  reasons: string[];
  paidUsd: number;
  payer: string;
  /// On-chain settlement tx for the $0.01 payment (Base), when the server
  /// echoes it. Surfaced as evidence the agent really paid for the screen.
  txHash?: string;
  screenedAt: number;
}

/// A counterparty's sanctions status doesn't move bid to bid; cache per
/// address for a day so rebids and renegotiations don't re-spend.
const screenCache = new Map<string, CounterpartyScreen>();
const SCREEN_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface GlobalApiCounterpartyResponse {
  address?: string;
  verdict?: 'PASS' | 'WARN' | 'BLOCK';
  verdict_reasons?: unknown[];
}

export async function screenCounterparty(address: string): Promise<CounterpartyScreen> {
  const key = address.toLowerCase();
  // Demo mode re-pays every time so the spend is visible on chain; otherwise
  // reuse a recent verdict (a sanctions status doesn't move bid to bid).
  if (!config.X402_SCREEN_CACHE_DISABLED) {
    const hit = screenCache.get(key);
    if (hit && Date.now() - hit.screenedAt < SCREEN_CACHE_TTL_MS) return hit;
  }

  const { data, paidUsd, payer, txHash } = await payExternal<GlobalApiCounterpartyResponse>(
    `${COUNTERPARTY_CHECK_URL}/${key}`,
  );
  if (data.verdict !== 'PASS' && data.verdict !== 'WARN' && data.verdict !== 'BLOCK') {
    throw new Error('counterparty check returned no verdict');
  }
  const result: CounterpartyScreen = {
    address: key,
    verdict: data.verdict,
    reasons: (data.verdict_reasons ?? []).map((r) => String(r)).slice(0, 8),
    paidUsd,
    payer,
    txHash,
    screenedAt: Date.now(),
  };
  screenCache.set(key, result);
  logger.info(
    { address: key, verdict: result.verdict, paidUsd },
    'x402: counterparty screened via GlobalAPI',
  );
  return result;
}
