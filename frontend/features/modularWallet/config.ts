import { ARC_NETWORK } from '@/core/arcNetwork';

/// Circle modular wallets: a passkey on the user's device owns a Circle smart
/// account. The client key is public by design and locked to Karwan's domain in
/// the Circle Console. A LIVE key serves mainnets only, so this runs on Arc
/// mainnet, where email users hold their own keys.
const CLIENT_KEY = process.env.NEXT_PUBLIC_CIRCLE_CLIENT_KEY?.trim() || null;
const CLIENT_URL = process.env.NEXT_PUBLIC_CIRCLE_CLIENT_URL?.trim().replace(/\/+$/, '') || null;

export const MODULAR_WALLETS_ENABLED = ARC_NETWORK === 'mainnet' && !!CLIENT_KEY && !!CLIENT_URL;

export function modularClient(): { key: string; url: string; chainUrl: string } {
  if (!CLIENT_KEY || !CLIENT_URL) throw new Error('Circle client key and URL are not configured');
  // Circle names the chain in the path: 'arc' is Arc mainnet (verified live
  // 2026-09-23: eth_chainId 0x13b2), 'arcTestnet' the testnet.
  const path = ARC_NETWORK === 'mainnet' ? 'arc' : 'arcTestnet';
  return { key: CLIENT_KEY, url: CLIENT_URL, chainUrl: `${CLIENT_URL}/${path}` };
}
