/// Reading what a user holds on Solana.
///
/// The backend could not do this at all until now, and the gap was not
/// cosmetic. `list_bridge_sources` is driven by the EVM chain table, so when a
/// user asked the assistant where their money was, Solana was not missing from
/// the answer — it was missing from the question. The assistant told a user with
/// 20 USDC sitting on Solana that they had no Solana wallet, and it was not
/// lying, because nothing in the process could see one.
///
/// Deliberately over the JSON-RPC wire rather than through @solana/web3.js. Two
/// reads is not worth a dependency in a process that otherwise never touches
/// Solana, and App Kit already owns every path that SIGNS there.

import { logger } from '../logger.js';

/// USDC on Solana Devnet. The mint address, not the symbol: a symbol is whatever
/// its deployer typed, and reading a balance by symbol is how a worthless token
/// gets reported to a user as dollars.
export const SOL_DEVNET_USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

const SPL_TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

/// Override with a private endpoint. The public devnet RPC rate-limits hard
/// enough that a burst of reads starts failing, and a failed read here degrades
/// to "unknown" rather than to zero, on purpose: telling a user they have
/// nothing is worse than telling them we could not check.
function rpcUrl(): string {
  return process.env.SOLANA_DEVNET_RPC_URL?.trim() || 'https://api.devnet.solana.com';
}

async function rpc<T>(method: string, params: unknown[]): Promise<T | null> {
  try {
    const res = await fetch(rpcUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { result?: T; error?: { message?: string } };
    if (body.error) {
      logger.warn({ method, err: body.error.message }, 'solana rpc returned an error');
      return null;
    }
    return body.result ?? null;
  } catch (err) {
    logger.warn({ method, err: (err as Error).message }, 'solana rpc read failed');
    return null;
  }
}

interface TokenAccounts {
  value?: Array<{
    account?: { data?: { parsed?: { info?: { tokenAmount?: { uiAmountString?: string } } } } };
  }>;
}

/// USDC held by `owner`, as a decimal string. `null` means the read failed, and
/// is not the same as '0'. Callers must keep the two apart.
export async function readSolanaUsdcBalance(owner: string): Promise<string | null> {
  const result = await rpc<TokenAccounts>('getTokenAccountsByOwner', [
    owner,
    { programId: SPL_TOKEN_PROGRAM },
    { encoding: 'jsonParsed' },
  ]);
  if (!result) return null;
  // An owner can hold several token accounts. Only USDC's counts, and the RPC
  // filter is by program rather than by mint, so the mint check happens here.
  let total = 0;
  for (const entry of result.value ?? []) {
    const info = entry.account?.data?.parsed?.info as
      | { mint?: string; tokenAmount?: { uiAmountString?: string } }
      | undefined;
    if (info?.mint !== SOL_DEVNET_USDC_MINT) continue;
    total += Number(info.tokenAmount?.uiAmountString ?? '0');
  }
  return Number.isFinite(total) ? total.toString() : null;
}

/// Native SOL, in lamports. `null` on a failed read.
export async function readSolanaLamports(owner: string): Promise<number | null> {
  const result = await rpc<{ value?: number }>('getBalance', [owner]);
  const value = result?.value;
  return typeof value === 'number' ? value : null;
}

/// What a CCTP burn costs to get off the ground: the transaction fee plus rent
/// for the Associated Token Account it may have to create. Circle sponsors gas
/// for its EVM wallets and does NOT on Solana, which is why a deposit wallet
/// there can hold dollars and still be unable to spend a cent of them.
///
/// Measured against a real failure on 2026-08-12: the burn wanted 0.000005 SOL
/// of fees on top of ~0.00203928 rent. 0.003 covers both with room to spare.
export const MIN_SOLANA_GAS_LAMPORTS = 3_000_000;

export interface SolanaHolding {
  usdc: string | null;
  lamports: number | null;
  /// False only when we KNOW there is not enough gas. An unreadable balance
  /// leaves this true, so a flaky RPC never invents a reason to refuse a move
  /// the user could actually make.
  canMove: boolean;
}

export async function readSolanaHolding(owner: string): Promise<SolanaHolding> {
  const [usdc, lamports] = await Promise.all([
    readSolanaUsdcBalance(owner),
    readSolanaLamports(owner),
  ]);
  return {
    usdc,
    lamports,
    canMove: lamports === null || lamports >= MIN_SOLANA_GAS_LAMPORTS,
  };
}
