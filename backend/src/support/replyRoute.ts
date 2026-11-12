import type { CaseChannel } from './cases.js';

/// Where a teammate's reply goes (view 78): back on the channel the person
/// last wrote from, then the other channels the account has. The website case
/// page always has it, so it is not listed. The first channel that takes the
/// reply is the only one used.

export type ReplyChannel = 'telegram' | 'email';

export function replyRoute(
  c: { lastChannel: CaseChannel; email?: string; address?: string },
  reach: { telegramLinked: boolean; verifiedEmail?: string },
): ReplyChannel[] {
  const can: Record<ReplyChannel, boolean> = {
    telegram: !!c.address && reach.telegramLinked,
    email: !!(c.email || reach.verifiedEmail),
  };
  const order: ReplyChannel[] = c.lastChannel === 'email' ? ['email', 'telegram'] : ['telegram', 'email'];
  return order.filter((ch) => can[ch]);
}

export async function deliverReply(
  route: readonly ReplyChannel[],
  send: Record<ReplyChannel, () => Promise<boolean>>,
): Promise<ReplyChannel[]> {
  for (const ch of route) {
    const took = await send[ch]().catch(() => false);
    if (took) return [ch];
  }
  return [];
}
