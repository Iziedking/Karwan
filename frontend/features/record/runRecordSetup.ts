import { api } from '@/core/api';

export type WalletCall = { to: `0x${string}`; data: `0x${string}` };
export type SendWalletCalls = (calls: WalletCall[]) => Promise<void>;

/// Sets up the person's Karwan record. A wallet Karwan holds: Karwan signs once
/// the person confirms it is them (the confirmation sheet opens from the
/// request). A wallet they hold: they sign the prepared calls; the agent links
/// are prepared only once the record exists, so it can take two rounds.
/// Resolves once the record is complete; throws a plain sentence otherwise.
export async function runRecordSetup(sendWalletCalls?: SendWalletCalls): Promise<void> {
  for (let round = 0; round < 3; round++) {
    const status = await api.recordSetupStatus();
    if (!status.available) throw new Error('Records are not open on this network yet.');
    if (status.complete) return;
    if (!status.calls) {
      if ((await api.recordSetup()).complete) return;
      throw new Error('Waiting for the network to confirm. Try again in a moment.');
    }
    if (!sendWalletCalls) throw new Error('Open Karwan in your browser to sign this in your wallet.');
    await sendWalletCalls(status.calls);
  }
  throw new Error('Waiting for the network to confirm. Try again in a moment.');
}

/// Whether the person still needs a record before a deal on the escrow family.
export async function recordSetupNeeded(): Promise<boolean> {
  const status = await api.recordSetupStatus().catch(() => null);
  return !!status?.available && !status.complete;
}
