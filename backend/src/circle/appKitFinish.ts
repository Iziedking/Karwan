/// The real side of money/appKitReconcile.ts: reading Circle's attestation API,
/// finishing a transfer Circle minted, and holding one for a person (view 60).

import { logger } from '../logger.js';
import { bus } from '../events.js';
import { ARC } from '../chain/client.js';
import { getBridge, listPendingBridges, patchBridge, type BridgeRelay } from '../db/bridges.js';
import { getMoneyMovement, updateMoneyMovement } from '../db/moneyMovements.js';
import { canTransitionMovement, transitionMoneyMovement } from '../money/model.js';
import { markCashoutFailed, recordCashoutLeg } from '../money/cashout.js';
import {
  reconcileAppKitBridges,
  type HoldReason,
  type IrisMessage,
  type ReconcileReport,
} from '../money/appKitReconcile.js';

export async function fetchIrisMessages(sourceDomain: number, burnTxHash: string): Promise<IrisMessage[] | null> {
  try {
    const res = await fetch(`${ARC.irisApiBase}/v2/messages/${sourceDomain}?transactionHash=${encodeURIComponent(burnTxHash)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { messages?: IrisMessage[] };
    return data.messages ?? null;
  } catch (err) {
    logger.warn({ sourceDomain, err: (err as Error).message }, 'attestation lookup for an App Kit transfer failed');
    return null;
  }
}

/// Circle minted: the same ending a live App Kit mint gets, movement first.
export async function finishAppKitBridge(row: BridgeRelay, mintTxHash: string): Promise<void> {
  if (row.movementReference) {
    const reference = row.movementReference;
    try {
      const current = await getMoneyMovement(reference);
      // A movement an earlier error parked for attention reopens: the money arrived.
      if (current?.state === 'needs_attention' && canTransitionMovement(current.state, 'preparing')) {
        await updateMoneyMovement(reference, (m) => transitionMoneyMovement(m, 'preparing', { nextActor: 'karwan' }));
      }
      if (row.sourceTxHash) await recordCashoutLeg(reference, 'burn', { txHash: row.sourceTxHash }).catch(() => undefined);
      const movement = await recordCashoutLeg(reference, 'mint', { txHash: mintTxHash });
      if (movement.state !== 'completed') {
        await patchBridge(row.bridgeId, { status: 'relaying', mintTxHash });
        return;
      }
    } catch (err) {
      logger.error({ bridgeId: row.bridgeId, err: (err as Error).message }, 'could not finish the movement of a reconciled App Kit transfer');
      return;
    }
  }
  await patchBridge(row.bridgeId, { status: 'minted', mintTxHash });
  logger.info({ bridgeId: row.bridgeId, mintTxHash }, 'App Kit transfer finished from its burn hash');
  bus.emitEvent({
    type: 'bridge.minted',
    actor: 'buyer',
    payload: {
      bridgeId: row.bridgeId,
      amountUsdc: row.amountUsdc,
      mintRecipient: row.mintRecipient,
      txHash: mintTxHash,
      ...(row.destChainKey ? { destChainKey: row.destChainKey } : {}),
      circle: true,
      appKit: true,
    },
  });
}

/// A person has to look. Nothing is sent again; the movement reads as being
/// checked by Karwan, and the row shows on the admin support page.
export async function holdAppKitBridge(row: BridgeRelay, reason: HoldReason): Promise<void> {
  await patchBridge(row.bridgeId, { held: { reason, at: Date.now() } });
  if (row.movementReference) await markCashoutFailed(row.movementReference, reason).catch(() => undefined);
  logger.error(
    { bridgeId: row.bridgeId, reason, sourceTxHash: row.sourceTxHash || null, sourceWallet: row.bridgeWalletAddress ?? null },
    'App Kit transfer held for support',
  );
}

let running: Promise<ReconcileReport> | null = null;

/// One pass over the open App Kit transfers, or only the one asked for. Passes
/// never overlap in this process.
export function reconcileAppKitNow(onlyBridgeId?: string): Promise<ReconcileReport> {
  if (!onlyBridgeId && running) return running;
  const pass = reconcileAppKitBridges({
    rows: async () => {
      if (!onlyBridgeId) return listPendingBridges();
      const row = await getBridge(onlyBridgeId);
      return row ? [row] : [];
    },
    messages: fetchIrisMessages,
    finish: finishAppKitBridge,
    hold: holdAppKitBridge,
    now: Date.now,
  });
  if (onlyBridgeId) return pass;
  running = pass.finally(() => {
    running = null;
  });
  return running;
}

const EVERY_MS = 60_000;

/// On boot and every minute after. Each pass costs one attestation read per
/// open App Kit transfer and nothing when there are none.
export function startAppKitReconciler(): () => void {
  const tick = () => {
    void reconcileAppKitNow().then(
      (report) => {
        if (report.finished.length || report.held.length) logger.info(report, 'App Kit reconcile pass');
      },
      (err) => logger.error({ err: (err as Error).message }, 'App Kit reconcile pass failed'),
    );
  };
  tick();
  const timer = setInterval(tick, EVERY_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
