import type { Address, Hex } from 'viem';

/// The person proves the GitHub account is theirs by publishing a gist with
/// this exact text, signed by their wallet. Karwan never vouches for the link.
export function proofMessage(wallet: Address, login: string, issued: string): string {
  return `karwan work proof\nwallet: ${wallet.toLowerCase()}\nlogin: ${login}\nissued: ${issued}`;
}

export interface GistProof {
  wallet: string;
  login: string;
  issued: string;
  signature: Hex;
}

const PROOF = /^karwan work proof\nwallet: (0x[0-9a-f]{40})\nlogin: ([A-Za-z0-9-]{1,39})\nissued: (\d{4}-\d{2}-\d{2})\nsignature: (0x[0-9a-fA-F]{130})\n?$/;

export function parseGistProof(text: string): GistProof | null {
  const m = PROOF.exec(text);
  if (!m) return null;
  return { wallet: m[1], login: m[2], issued: m[3], signature: m[4] as Hex };
}

const MAX_AGE = 30 * 86_400;

export type ProofProblem = 'GIST_OWNER_MISMATCH' | 'LOGIN_MISMATCH' | 'WALLET_MISMATCH' | 'PROOF_EXPIRED' | 'PROOF_FROM_FUTURE';

/// Everything but the signature, which needs the chain for smart accounts.
export function proofProblem(
  p: GistProof,
  expected: { wallet: string; login: string; gistOwner: string; now: number },
): ProofProblem | null {
  if (expected.gistOwner.toLowerCase() !== expected.login.toLowerCase()) return 'GIST_OWNER_MISMATCH';
  if (p.login.toLowerCase() !== expected.login.toLowerCase()) return 'LOGIN_MISMATCH';
  if (p.wallet !== expected.wallet.toLowerCase()) return 'WALLET_MISMATCH';
  const issued = Date.parse(`${p.issued}T00:00:00Z`) / 1000;
  if (Number.isNaN(issued) || expected.now - issued > MAX_AGE) return 'PROOF_EXPIRED';
  if (issued > expected.now + 86_400) return 'PROOF_FROM_FUTURE';
  return null;
}
