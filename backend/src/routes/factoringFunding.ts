import { formatUnits } from 'viem';

/// The advance of a financing offer is paid from the financier's own wallet
/// when the seller accepts. An offer the wallet cannot cover used to go out
/// anyway and fail on chain at accept (owner report, 20 Oct 2026), so both
/// ends now check the wallet first.

export function advanceShortfall(walletMicros: bigint, advanceMicros: bigint): bigint {
  return walletMicros >= advanceMicros ? 0n : advanceMicros - walletMicros;
}

const usdc = (micros: bigint) => formatUnits(micros, 6);

/// Null when the financier can send this offer.
export function offerRefusal(walletMicros: bigint, advanceMicros: bigint) {
  const short = advanceShortfall(walletMicros, advanceMicros);
  return short === 0n ? null : { error: 'advance not funded', code: 'ADVANCE_NOT_FUNDED' as const, shortfallUsdc: usdc(short) };
}

/// Null when the seller's accept can go to the chain.
export function acceptRefusal(walletMicros: bigint, advanceMicros: bigint) {
  const short = advanceShortfall(walletMicros, advanceMicros);
  return short === 0n
    ? null
    : { error: 'The financier has not added the money for this offer yet.', code: 'FINANCIER_NOT_FUNDED' as const, shortfallUsdc: usdc(short) };
}
