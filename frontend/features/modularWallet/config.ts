import { ARC_NETWORK, type ArcNetworkName } from '@/core/arcNetwork';

/// Circle modular wallets: a passkey on the user's device owns a Circle smart
/// account. The client key is public by design and locked to Karwan's domain in
/// the Circle Console. Always on for Arc mainnet, where email users hold their
/// own keys. NEXT_PUBLIC_USER_WALLETS=modular turns it on for testnet too, with
/// a Circle sandbox (TEST_) key allowed on localhost: the local test setup.
const CLIENT_KEY = process.env.NEXT_PUBLIC_CIRCLE_CLIENT_KEY?.trim() || null;
const CLIENT_URL = process.env.NEXT_PUBLIC_CIRCLE_CLIENT_URL?.trim().replace(/\/+$/, '') || null;

/// Circle refuses a LIVE key on testnets and a TEST key on mainnets, so a
/// mismatched key turns the feature off rather than showing a sign-in that can
/// only fail.
export function modularWalletsEnabled(input: {
  network: ArcNetworkName;
  userWallets: string | undefined;
  key: string | null;
  url: string | null;
}): boolean {
  if (!input.key || !input.url) return false;
  if (input.network === 'mainnet') return input.key.startsWith('LIVE_');
  return input.userWallets?.trim() === 'modular' && input.key.startsWith('TEST_');
}

export const MODULAR_WALLETS_ENABLED = modularWalletsEnabled({
  network: ARC_NETWORK,
  userWallets: process.env.NEXT_PUBLIC_USER_WALLETS,
  key: CLIENT_KEY,
  url: CLIENT_URL,
});

export function modularClient(): { key: string; url: string; chainUrl: string } {
  if (!CLIENT_KEY || !CLIENT_URL) throw new Error('Circle client key and URL are not configured');
  // Circle names the chain in the path: 'arc' is Arc mainnet (verified live
  // 2026-09-23: eth_chainId 0x13b2), 'arcTestnet' the testnet.
  const path = ARC_NETWORK === 'mainnet' ? 'arc' : 'arcTestnet';
  return { key: CLIENT_KEY, url: CLIENT_URL, chainUrl: `${CLIENT_URL}/${path}` };
}
