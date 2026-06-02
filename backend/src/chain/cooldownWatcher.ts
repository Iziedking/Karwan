import { resolve, dirname } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { formatUnits } from 'viem';
import { publicClient } from './client.js';
import { config } from '../config.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';

/// Periodic watcher that fires `vault.cooldown.completed` when a position's
/// 3-day cooldown crosses the wire. The vault has no on-chain event for the
/// transition because it is purely time-based, so the only way to surface it
/// to the user is to poll. Scope is small (max ~21 positions per address per
/// the comment in `vault.routes`) so a full-table scan every few minutes is
/// cheaper to operate than a per-position scheduled timer.

const STATE_PATH = resolve(process.cwd(), 'data', 'cooldownNotified.json');
const POLL_MS = 5 * 60 * 1000;
const USDC_DECIMALS = 6;
const POSITION_STATE_COOLING = 2;

const vaultAbi = [
  {
    type: 'function',
    name: 'nextPositionId',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'positions',
    inputs: [{ type: 'uint256' }],
    outputs: [
      { type: 'address' },
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'uint8' },
    ],
    stateMutability: 'view',
  },
] as const;

interface PersistedState {
  notified: string[];
}

function loadNotified(): { set: Set<string>; existed: boolean } {
  if (!existsSync(STATE_PATH)) return { set: new Set(), existed: false };
  try {
    const raw = readFileSync(STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as PersistedState;
    return { set: new Set(parsed.notified ?? []), existed: true };
  } catch {
    return { set: new Set(), existed: false };
  }
}

function persistNotified(set: Set<string>): void {
  try {
    const dir = dirname(STATE_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const payload: PersistedState = { notified: Array.from(set) };
    writeFileSync(STATE_PATH, JSON.stringify(payload), 'utf8');
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'cooldown watcher persist failed');
  }
}

function vaultAddress(): `0x${string}` | null {
  const v = (config as unknown as Record<string, string | undefined>).KARWAN_VAULT_ADDR;
  return v ? (v as `0x${string}`) : null;
}

export function startCooldownWatcher(): () => void {
  const vault = vaultAddress();
  if (!vault) {
    logger.warn('cooldown watcher: KARWAN_VAULT_ADDR unset, not starting');
    return () => {};
  }

  const { set: notified, existed } = loadNotified();
  /// On a fresh boot with no persisted state we mark every currently-claimable
  /// position as already-handled so a server that comes online after weeks of
  /// activity does not spam every user with stale "cooldown finished" alerts.
  let firstScan = !existed;
  let stopped = false;

  async function scan(): Promise<void> {
    if (stopped) return;
    let nextId: bigint;
    try {
      nextId = (await publicClient.readContract({
        address: vault!,
        abi: vaultAbi,
        functionName: 'nextPositionId',
      })) as bigint;
    } catch (err) {
      logger.warn(
        { err: (err as Error).message },
        'cooldown watcher: nextPositionId read failed; will retry next tick',
      );
      return;
    }
    if (nextId < 0n) return;

    const ids: bigint[] = [];
    for (let i = 0n; i <= nextId; i++) ids.push(i);

    const results = await Promise.allSettled(
      ids.map((id) =>
        publicClient.readContract({
          address: vault!,
          abi: vaultAbi,
          functionName: 'positions',
          args: [id],
        }),
      ),
    );

    const now = Math.floor(Date.now() / 1000);
    let firedThisScan = 0;
    let dirty = false;

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (!r || r.status !== 'fulfilled') continue;
      const tuple = r.value as readonly [`0x${string}`, bigint, bigint, bigint, bigint, number];
      const owner = tuple[0];
      const principal = tuple[1];
      const claimableAt = tuple[4];
      const state = tuple[5];

      if (state !== POSITION_STATE_COOLING) continue;
      if (Number(claimableAt) > now) continue;

      const key = `${owner.toLowerCase()}:${ids[i]!.toString()}`;
      if (notified.has(key)) continue;

      if (firstScan) {
        notified.add(key);
        dirty = true;
        continue;
      }

      bus.emitEvent({
        type: 'vault.cooldown.completed',
        actor: 'platform',
        payload: {
          address: owner.toLowerCase(),
          positionId: ids[i]!.toString(),
          principalUsdc: formatUnits(principal, USDC_DECIMALS),
          claimableAt: Number(claimableAt),
        },
      });
      notified.add(key);
      dirty = true;
      firedThisScan += 1;
    }

    if (dirty) persistNotified(notified);
    if (firedThisScan > 0) {
      logger.info(
        { count: firedThisScan },
        'cooldown watcher: emitted vault.cooldown.completed events',
      );
    }
    firstScan = false;
  }

  void scan();
  const timer = setInterval(() => void scan(), POLL_MS);

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
