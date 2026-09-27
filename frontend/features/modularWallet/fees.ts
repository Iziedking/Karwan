type GasLevel = { maxFeePerGas: string; maxPriorityFeePerGas: string };
export type CircleGasPrice = { low: GasLevel; medium: GasLevel; high: GasLevel };

/// Circle's bundler rejects viem's default estimate, whose priority fee on Arc
/// is a few wei; it requires at least 1 gwei. Its own price always passes.
export function circleFeeEstimator(getPrice: () => Promise<CircleGasPrice>) {
  return async () => {
    const { medium } = await getPrice();
    return { maxFeePerGas: BigInt(medium.maxFeePerGas), maxPriorityFeePerGas: BigInt(medium.maxPriorityFeePerGas) };
  };
}
