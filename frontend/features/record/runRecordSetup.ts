import { api } from '@/core/api';
import type { OwnWallet } from '@/shared/chain/useOwnWalletSend';

/// Sets up the person's Karwan record when they ask for it (the assistant's
/// card, the receipt line). Usually it sets itself up on the way: Karwan signs
/// for a wallet it holds, and a person's own wallet carries the steps with its
/// next Arc transaction (view 27, decision 10). Here a wallet they hold sends
/// the missing steps alone, in one transaction. Resolves once the record is
/// complete; throws a plain sentence otherwise.
export async function runRecordSetup(ownWallet?: OwnWallet): Promise<void> {
  const status = await api.recordSetupStatus();
  if (!status.available) throw new Error('Records are not open on this network yet.');
  if (status.complete) return;
  if (!status.steps) {
    if ((await api.recordSetup()).complete) return;
    throw new Error('Waiting for the network to confirm. Try again in a moment.');
  }
  if (!ownWallet) throw new Error('Open Karwan in your browser to sign this in your wallet.');
  const sent = await ownWallet.send([]);
  if (!(await ownWallet.recordDone(sent))) throw new Error('Waiting for the network to confirm. Try again in a moment.');
}
