import {
  BatchFacilitatorClient,
  GATEWAY_AUTH_VALIDITY_WINDOW_SECONDS,
} from '@circle-fin/x402-batching/server';
import type { Context } from 'hono';
import { config } from '../config.js';
import { logger } from '../logger.js';

/// Karwan-as-seller x402 payment helper for Hono routes, backed by Circle
/// Gateway's batched-settlement facilitator. A request without a
/// Payment-Signature header gets a 402 carrying the PAYMENT-REQUIRED offer
/// header (the shape GatewayClient.pay() consumes); a signed retry is
/// verified and settled through Circle Gateway, landing USDC in the
/// platform treasury.

const FACILITATOR_URL = 'https://gateway-api-testnet.circle.com';
/// Arc Testnet only. Buyers pay from an Arc Gateway deposit; Gateway
/// requires deposit and payment on the same chain.
const ACCEPTED_NETWORKS = ['eip155:5042002'];

/// Shared client. The factoring settlement watcher reuses this same
/// instance for Gateway batch submission.
export const facilitator = new BatchFacilitatorClient({ url: FACILITATOR_URL });

interface SupportedKind {
  x402Version: number;
  scheme: string;
  network: string;
  extra?: Record<string, unknown>;
}

interface SignedPaymentHeader {
  x402Version: number;
  payload: Record<string, unknown>;
  accepted?: { network?: string };
}

/// Supported kinds from the facilitator, cached after the first successful
/// fetch. Carries per-network verifyingContract + USDC addresses.
let cachedKinds: SupportedKind[] | null = null;

async function acceptedKinds(): Promise<SupportedKind[]> {
  if (!cachedKinds) {
    const supported = await facilitator.getSupported();
    cachedKinds = supported.kinds;
  }
  return cachedKinds.filter(
    (k) => ACCEPTED_NETWORKS.includes(k.network) && k.extra?.verifyingContract,
  );
}

function usdcAddressOf(kind: SupportedKind): string | null {
  const assets = kind.extra?.assets as
    | Array<{ symbol: string; address: string }>
    | undefined;
  return assets?.find((a) => a.symbol === 'USDC')?.address ?? null;
}

function requirementsFor(kind: SupportedKind, priceUsd: number, payTo: string) {
  const asset = usdcAddressOf(kind);
  if (!asset) return null;
  return {
    scheme: 'exact',
    network: kind.network,
    asset,
    amount: Math.round(priceUsd * 1e6).toString(),
    payTo,
    maxTimeoutSeconds: GATEWAY_AUTH_VALIDITY_WINDOW_SECONDS,
    extra: {
      name: 'GatewayWalletBatched',
      version: '1',
      verifyingContract: kind.extra?.verifyingContract,
    },
  };
}

export interface X402Payment {
  payer: string;
  network: string;
  amountAtomic: string;
  transaction: string;
}

/// Charge the request. Returns a finished Response when payment is missing,
/// invalid or fails to settle, or the settled payment when USDC moved.
/// Callers branch with `instanceof Response`.
///
/// Price, asset and payee are always rebuilt server-side; only the network
/// choice is read from the client's header.
export async function requirePayment(
  c: Context,
  priceUsd: number,
  description: string,
): Promise<X402Payment | Response> {
  const payTo = config.KARWAN_TREASURY_ADDR;
  if (!payTo) return c.json({ error: 'x402 not configured' }, 503);

  const header = c.req.header('payment-signature');

  try {
    if (!header) {
      const kinds = await acceptedKinds();
      const accepts = kinds
        .map((k) => requirementsFor(k, priceUsd, payTo))
        .filter((r): r is NonNullable<typeof r> => r !== null);
      if (accepts.length === 0) {
        return c.json({ error: 'no payment networks available' }, 503);
      }
      const paymentRequired = {
        x402Version: 2,
        resource: { url: c.req.path, description, mimeType: 'application/json' },
        accepts,
      };
      c.header(
        'PAYMENT-REQUIRED',
        Buffer.from(JSON.stringify(paymentRequired)).toString('base64'),
      );
      return c.json({}, 402);
    }

    let signed: SignedPaymentHeader;
    try {
      signed = JSON.parse(Buffer.from(header, 'base64').toString('utf-8'));
    } catch {
      return c.json({ error: 'malformed payment-signature header' }, 400);
    }
    const network = signed.accepted?.network;
    if (!network) {
      return c.json({ error: 'missing accepted requirements in payment' }, 400);
    }

    const kinds = await acceptedKinds();
    const kind = kinds.find((k) => k.network === network);
    const requirements = kind ? requirementsFor(kind, priceUsd, payTo) : null;
    if (!requirements) {
      return c.json({ error: `network ${network} not accepted` }, 400);
    }

    const verdict = await facilitator.verify(signed, requirements);
    if (!verdict.isValid) {
      return c.json(
        { error: 'payment verification failed', reason: verdict.invalidReason },
        402,
      );
    }

    const settled = await facilitator.settle(signed, requirements);
    if (!settled.success) {
      return c.json(
        { error: 'payment settlement failed', reason: settled.errorReason },
        402,
      );
    }

    const payer = settled.payer ?? verdict.payer ?? '';
    c.header(
      'PAYMENT-RESPONSE',
      Buffer.from(
        JSON.stringify({
          success: true,
          transaction: settled.transaction,
          network,
          payer,
        }),
      ).toString('base64'),
    );
    logger.info(
      { payer, network, amount: requirements.amount, transaction: settled.transaction },
      'x402: payment settled',
    );
    return {
      payer,
      network,
      amountAtomic: requirements.amount,
      transaction: settled.transaction,
    };
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'x402: facilitator call failed');
    return c.json(
      { error: 'payment facilitator unavailable', detail: (err as Error).message },
      502,
    );
  }
}
