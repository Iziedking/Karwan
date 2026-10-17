import type { DirectMessagesCopy } from '../../shared/i18n/messages/directMessages';

/// Why a send was refused, in the reader's language. The server's code picks
/// the line; anything unknown falls back to "Not sent".
export function refusalText(
  body: { code?: string; until?: number },
  now: number,
  tag: string,
  t: DirectMessagesCopy,
): string {
  switch (body.code) {
    case 'paused': {
      const hours = Math.max(1, Math.ceil(((body.until ?? now) - now) / (60 * 60 * 1000)));
      return t.refused.paused.replace('{hours}', String(hours));
    }
    case 'wait_reply':
      return t.refused.wait_reply.replace('{tag}', tag);
    case 'no_tag':
      return t.refused.no_tag;
    case 'link_blocked':
      return t.refused.link_blocked;
    case 'self':
      return t.refused.self;
    case 'unknown_tag':
      return t.notFound;
    default:
      return t.sendFailed;
  }
}
