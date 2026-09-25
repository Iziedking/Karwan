import { sfx } from '@/shared/utils/sfx';
import type { MoneySoundKind } from './synth';

export type MoneyDirection = 'in' | 'out';
export type TxOutcome = 'success' | 'pending' | 'reverted';

/// What makes two sounds the same movement. `ids` are the movement's own
/// identifiers (Karwan reference, transaction hash, transfer id). `deal` is the
/// deal it belongs to, consulted only when an event carries no id of its own.
export interface SoundKeys {
  ids: ReadonlyArray<string | null | undefined>;
  deal?: string | null;
}

export interface SoundPlayer {
  money(kind: MoneySoundKind): void;
  /// The kit's existing tone, for a notification that is not money.
  notice(): void;
}

export interface MoneySounds {
  /// A money button was pressed.
  submit(): void;
  /// The movement on screen reached an outcome. Coin drop on success only:
  /// pending and reverted are silent because the screen says what happened.
  outcome(result: TxOutcome, keys: SoundKeys): void;
  /// A notification arrived. `null` means it is not money arriving or leaving.
  notified(direction: MoneyDirection | null, keys: SoundKeys): void;
  /// The open screen owns these movements; their notifications stay quiet.
  claim(keys: SoundKeys): void;
}

/// How long a movement stays heard. The balance watcher reports wallet credits
/// and debits on a 60 second poll, so the wallet event for a movement the user
/// just watched can land a minute after the screen's own sound.
export const DEDUPE_WINDOW_MS = 120_000;
/// A pressed money button holds notification sounds until its outcome, for at
/// most this long.
export const HOLD_MAX_MS = 90_000;
/// And for this long after the outcome, so the movement's own notification,
/// racing the screen, stays quiet.
export const HOLD_AFTER_OUTCOME_MS = 3_000;

interface Heard {
  at: number;
  claimed: boolean;
  sounded: boolean;
  notice: boolean;
}

function ownIds(keys: SoundKeys): string[] {
  return keys.ids
    .filter((id): id is string => typeof id === 'string' && id.trim() !== '')
    .map((id) => id.trim().toLowerCase());
}

function allKeys(keys: SoundKeys): string[] {
  const deal = keys.deal?.trim().toLowerCase();
  return deal ? [...ownIds(keys), `deal:${deal}`] : ownIds(keys);
}

/// The keys that decide whether a movement was already heard: its own ids when
/// it has any, otherwise its deal.
function probeKeys(keys: SoundKeys): string[] {
  const own = ownIds(keys);
  return own.length > 0 ? own : allKeys(keys);
}

function safely(play: () => void) {
  try {
    play();
  } catch {
    /* a sound is never the only signal */
  }
}

export function createMoneySounds(player: SoundPlayer, now: () => number = Date.now): MoneySounds {
  const heard = new Map<string, Heard>();
  let holdUntil = 0;

  function prune(t: number) {
    for (const [key, entry] of heard) {
      if (t - entry.at > DEDUPE_WINDOW_MS) heard.delete(key);
    }
  }

  function found(keys: SoundKeys, match: (entry: Heard) => boolean): boolean {
    return probeKeys(keys).some((key) => {
      const entry = heard.get(key);
      return entry !== undefined && match(entry);
    });
  }

  function mark(keys: SoundKeys, t: number, flag: 'claimed' | 'sounded' | 'notice') {
    for (const key of allKeys(keys)) {
      const next: Heard = { ...(heard.get(key) ?? { at: t, claimed: false, sounded: false, notice: false }), at: t };
      next[flag] = true;
      heard.set(key, next);
    }
  }

  return {
    submit() {
      holdUntil = now() + HOLD_MAX_MS;
      safely(() => player.money('swoosh'));
    },
    outcome(result, keys) {
      const t = now();
      prune(t);
      holdUntil = t + HOLD_AFTER_OUTCOME_MS;
      if (result !== 'success') {
        mark(keys, t, 'claimed');
        return;
      }
      const already = found(keys, (entry) => entry.sounded);
      mark(keys, t, 'sounded');
      if (!already) safely(() => player.money('coinDrop'));
    },
    notified(direction, keys) {
      const t = now();
      prune(t);
      if (direction === null) {
        const quiet = found(keys, (entry) => entry.claimed || entry.sounded || entry.notice);
        mark(keys, t, 'notice');
        if (!quiet) safely(() => player.notice());
        return;
      }
      // A money sound is held back only by money: the screen that owns the
      // movement, a sound already made for it, or a pressed button still
      // waiting on its outcome. A plain tone on the same deal never eats a
      // payment's coin.
      const quiet = t < holdUntil || found(keys, (entry) => entry.claimed || entry.sounded);
      mark(keys, t, quiet ? 'claimed' : 'sounded');
      if (!quiet) safely(() => player.money(direction === 'in' ? 'coin' : 'wave'));
    },
    claim(keys) {
      const t = now();
      prune(t);
      mark(keys, t, 'claimed');
    },
  };
}

/// The app's instance on the real kit. Muting lives in sfx.
export const moneySounds: MoneySounds = createMoneySounds({
  money: (kind) => sfx.playMoney(kind),
  notice: () => sfx.send(),
});
