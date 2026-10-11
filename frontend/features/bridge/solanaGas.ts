/// Whether a failed transfer from Solana ran short of SOL for the network fee.
/// Circle does not sponsor gas for transfers that start on Solana, so the
/// deposit wallet needs a little SOL of its own.
export function isSolanaGasShortfall(raw: string): boolean {
  return /\bsol\b|insufficient/i.test(raw);
}
