/// Get test USDC on the wallets page: Karwan asks Circle's faucet for the
/// wallet first. When the faucet says no (the day's test USDC has run out),
/// the address is copied and Circle's faucet page opens, as before.
export async function claimTestUsdc(deps: {
  request: () => Promise<unknown>;
  copy: () => Promise<void>;
  openFaucet: () => void;
}): Promise<'sent' | 'copied' | 'manual'> {
  try {
    await deps.request();
    return 'sent';
  } catch {
    let copied = true;
    try {
      await deps.copy();
    } catch {
      copied = false;
    }
    deps.openFaucet();
    return copied ? 'copied' : 'manual';
  }
}
