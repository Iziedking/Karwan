/**
 * Serializes one Gateway funding operation per beneficiary.
 *
 * This coordinator owns no wallet, provider, or financial policy authority.
 * It only shares the existing operation promise so concurrent callers cannot
 * both observe the same insufficient balance and submit duplicate top-ups.
 */
export class GatewayFundingCoordinator {
  private readonly inFlight = new Map<string, Promise<unknown>>();

  run<T>(beneficiaryAddress: string, operation: () => Promise<T>): Promise<T> {
    const key = beneficiaryAddress.trim().toLowerCase();
    if (!key) throw new Error('Gateway funding requires a beneficiary key');

    const prior = this.inFlight.get(key);
    if (prior) return prior as Promise<T>;

    const pending = Promise.resolve().then(operation);
    this.inFlight.set(key, pending);
    return pending.finally(() => {
      if (this.inFlight.get(key) === pending) this.inFlight.delete(key);
    }) as Promise<T>;
  }

  get inFlightCount(): number {
    return this.inFlight.size;
  }
}

export const gatewayFundingCoordinator = new GatewayFundingCoordinator();
