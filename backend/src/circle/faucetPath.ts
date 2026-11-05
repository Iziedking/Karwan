/// How a testnet drip is served. Circle's faucet API refuses ETH-SEPOLIA, so it
/// stays on the web faucet. Arc Testnet drips from the API (checked 5 Nov 2026,
/// docs/arc-circle-checks.md), but the API allows ten drips a day for the whole
/// developer account, so sign-up does not spend them: only a person who asks
/// for test USDC gets an Arc drip.
export type DripReason = 'request' | 'signup';

const WEB_FAUCET_ONLY = new Set<string>(['ETH-SEPOLIA']);
const NOT_AT_SIGNUP = new Set<string>(['ARC-TESTNET']);

export function faucetPath(blockchain: string, reason: DripReason): 'api' | 'web' | 'skip' {
  if (WEB_FAUCET_ONLY.has(blockchain)) return 'web';
  if (reason === 'signup' && NOT_AT_SIGNUP.has(blockchain)) return 'skip';
  return 'api';
}
