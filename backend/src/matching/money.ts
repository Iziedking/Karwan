const USDC_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/;

export function parseUsdcMicro(value: string): bigint {
  const trimmed = value.trim();
  if (!USDC_PATTERN.test(trimmed)) throw new Error(`invalid USDC amount: ${value}`);
  const [whole = '0', fraction = ''] = trimmed.split('.');
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
}

export function boundedRatioScore(numerator: bigint, denominator: bigint): number {
  if (denominator <= 0n) return 0;
  if (numerator <= 0n) return 0;
  if (numerator >= denominator) return 100;
  return Number((numerator * 100n) / denominator);
}
