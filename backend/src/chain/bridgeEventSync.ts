/// Synthesizes `bridge.minted` events into the bus from the per-user bridge
/// persistence at data/bridges.json. Fixes the "/activity shows BRIDGE: 0
/// but bridge history modal shows N" inconsistency that surfaces after a
/// data/events.json wipe: the bus loses its bridge events but the per-user
/// bridge persistence (a separate file) survives.
///
/// Runs once on boot, after the chain event backfill. Idempotent: bus
/// dedupes by (type|jobId|ts) so re-running on the next boot won't double-
/// inject.
import { listAllBridges } from '../db/bridges.js';
import { bus, type KarwanEvent } from '../events.js';
import { logger } from '../logger.js';

export async function syncBridgeEventsToBus(): Promise<{
  scanned: number;
  injected: number;
}> {
  let bridges;
  try {
    bridges = await listAllBridges();
  } catch (err) {
    logger.warn(
      { err: (err as Error).message },
      'bridge event sync: listAllBridges failed; skipping',
    );
    return { scanned: 0, injected: 0 };
  }
  /// Only completed bridges produce a `bridge.minted` activity event. Failed
  /// and in-flight bridges stay in the per-user history but don't surface as
  /// network activity.
  const completed = bridges.filter((b) => b.status === 'minted');
  if (completed.length === 0) {
    return { scanned: 0, injected: 0 };
  }
  const events: KarwanEvent[] = completed.map((b) => ({
    type: 'bridge.minted',
    /// Bridges don't have jobIds. Use the bridgeId so the bus's dedupe key
    /// (type|jobId|ts) gives each bridge its own slot.
    jobId: b.bridgeId,
    ts: b.updatedAt,
    actor: 'platform',
    payload: {
      bridgeId: b.bridgeId,
      amountUsdc: b.amountUsdc,
      mintRecipient: b.mintRecipient,
      mintTxHash: b.mintTxHash,
      sourceChainKey: b.sourceChainKey,
      direction: b.direction ?? 'in',
    },
  }));
  const injected = bus.injectHistorical(events);
  logger.info(
    { scanned: completed.length, injected },
    'bridge event sync: bus alignment complete',
  );
  return { scanned: completed.length, injected };
}
