/// Paytag handle resolution (@handle -> 0x address).
///
/// Paytag is a payment-identity registry on Arc: an ERC-721 where each handle is
/// a token, with a permissionless `resolve(string) view returns (address)`. We
/// read it through our own Arc client, so resolution needs no API key and no
/// account with them. The hosted REST endpoint is a keyless fallback for handles
/// that exist in their database but have not been minted on the chain we run on.
///
/// TWO RULES THIS MODULE EXISTS TO ENFORCE.
///
/// 1. A handle is an ERC-721 token, so it is TRANSFERABLE. Resolve once, at the
///    moment the deal is created, and pin the address onto the deal. Money moves
///    against the pinned address forever after. Never re-resolve a handle at
///    release, repayment, or payout: the counterparty could sell or transfer the
///    handle mid-deal and redirect the funds. Callers get an address; the handle
///    is only ever carried alongside as a display label.
///
/// 2. A handle is NOT a verification. Anyone can claim any unclaimed name. It
///    says nothing about who someone is, and must never be shown with the weight
///    of the verified-business badge.

import { getAddress, parseAbi, type Address } from 'viem';
import { publicClient } from '../chain/client.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

const ZERO = '0x0000000000000000000000000000000000000000';

/// Their registry exposes plain `resolve(name)`. Verified live on Arc Testnet:
/// name() = "Payee Identity Protocol", symbol() = "Paytag".
const registryAbi = parseAbi(['function resolve(string) view returns (address)']);

/// Handles are lowercase alphanumerics plus _ and -, no leading @ once
/// normalized. Anything else is rejected before it reaches the network so a
/// malformed handle can't be smuggled into a contract read or a URL.
const HANDLE_RE = /^[a-z0-9_-]{1,32}$/;

export interface PaytagResolution {
  handle: string;
  address: Address;
  /// Which path answered. Useful in logs when their API and the chain disagree.
  source: 'chain' | 'api';
}

/// Handles rarely move, and we pin the address at deal creation anyway, so a
/// short cache is safe and keeps the create form responsive while someone types.
const TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; value: PaytagResolution | null }>();

export function normalizeHandle(raw: string): string | null {
  const h = raw.trim().replace(/^@/, '').toLowerCase();
  return HANDLE_RE.test(h) ? h : null;
}

/// Mask an address for display: 0x1234…cdef. The counterparty hands over a
/// handle, so the deal page should not put their full address back on screen.
/// The address is still public on chain; this keeps it out of the UI, not out
/// of existence.
export function maskAddress(addr: string): string {
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

async function resolveOnChain(handle: string): Promise<Address | null> {
  try {
    const addr = (await publicClient.readContract({
      address: config.PAYTAG_REGISTRY_ADDR as Address,
      abi: registryAbi,
      functionName: 'resolve',
      args: [handle],
    })) as Address;
    if (!addr || addr.toLowerCase() === ZERO) return null;
    return getAddress(addr);
  } catch (err) {
    logger.debug({ handle, err: (err as Error).message }, 'paytag on-chain resolve failed');
    return null;
  }
}

async function resolveViaApi(handle: string): Promise<Address | null> {
  const base = config.PAYTAG_API_BASE.replace(/\/$/, '');
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 5_000);
    const res = await fetch(
      `${base}/api/wallet/resolve-username?username=${encodeURIComponent(handle)}`,
      { signal: ac.signal, headers: { accept: 'application/json' } },
    );
    clearTimeout(t);
    if (!res.ok) return null;
    const body = (await res.json()) as { address?: string };
    if (!body.address || !/^0x[a-fA-F0-9]{40}$/.test(body.address)) return null;
    return getAddress(body.address);
  } catch (err) {
    logger.debug({ handle, err: (err as Error).message }, 'paytag api resolve failed');
    return null;
  }
}

/// Resolve a handle to the address that owned it AT THIS MOMENT. The caller must
/// persist the result; see rule 1 in the module header.
export async function resolvePaytag(raw: string): Promise<PaytagResolution | null> {
  if (!config.PAYTAG_ENABLED) return null;

  const handle = normalizeHandle(raw);
  if (!handle) return null;

  const hit = cache.get(handle);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  let value: PaytagResolution | null = null;

  const onChain = await resolveOnChain(handle);
  if (onChain) {
    value = { handle, address: onChain, source: 'chain' };
  } else {
    const viaApi = await resolveViaApi(handle);
    if (viaApi) value = { handle, address: viaApi, source: 'api' };
  }

  cache.set(handle, { at: Date.now(), value });
  return value;
}
