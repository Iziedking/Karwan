import waitTips from './waitTips.json' with { type: 'json' };

/// While a chat-app turn runs: typing every few seconds, and on a slow turn one
/// short tip, once, before the answer (view 84). Neither can break the turn.
export async function withWaitNotes<T>(
  work: () => Promise<T>,
  notes: {
    typing?: () => Promise<void>;
    tip?: () => Promise<void>;
    everyMs?: number;
    tipAfterMs?: number;
    timers?: { set: typeof setTimeout; clear: typeof clearTimeout };
  },
): Promise<T> {
  const set = notes.timers?.set ?? setTimeout;
  const clear = notes.timers?.clear ?? clearTimeout;
  const everyMs = notes.everyMs ?? 4_000;
  const tipAfterMs = notes.tipAfterMs ?? 4_000;
  let running = true;
  let typingTimer: ReturnType<typeof setTimeout> | undefined;
  let tipTimer: ReturnType<typeof setTimeout> | undefined;

  const type = () => {
    if (!running || !notes.typing) return;
    void notes.typing().catch(() => undefined);
    typingTimer = set(type, everyMs);
  };
  type();
  if (notes.tip) {
    const tip = notes.tip;
    tipTimer = set(() => {
      if (running) void tip().catch(() => undefined);
    }, tipAfterMs);
  }
  try {
    return await work();
  } finally {
    running = false;
    clear(typingTimer);
    clear(tipTimer);
  }
}

const POOL: string[] = [...waitTips.deal, ...waitTips.safety];
const turns = new Map<string, number>();

/// The next deal or safety tip for this chat: each chat goes through them in
/// turn, from the first. Kept in memory; a restart starts each chat again.
export function tipForChat(chatKey: string): string {
  const n = turns.get(chatKey) ?? 0;
  turns.set(chatKey, n + 1);
  if (turns.size > 10_000) turns.delete(turns.keys().next().value as string);
  return POOL[n % POOL.length]!;
}
