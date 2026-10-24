import { tool } from 'ai';
import { z } from 'zod';
import type { PassportShare } from '../db/passportShares.js';
import { createShare, shareView, type ShareDeps } from '../sealed/passportShares.js';

/// Showing the person's full passport to someone, from any channel (view 29).
/// Others see only the sealed passport; a share opens the full record for one
/// named person, signed in, or for anyone holding the link, until it ends.

export interface PassportShareToolDeps extends ShareDeps {
  stop: (subject: string, id: string, now: number) => Promise<boolean>;
}

const untilText = (ms: number) => new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

export function passportShareTools(address: string, deps: PassportShareToolDeps) {
  const listed = async () => (await deps.live(address, deps.now())).map((s: PassportShare) => ({ ...shareView(s), until: untilText(s.expiresAt) }));
  return {
    share_my_passport: tool({
      description:
        "Show the user's full passport (standing, score, deals, disputes, volume, money held as a reserve) to someone who asks for it, for 24 hours or 7 days. Name a Karwan tag to open it only for that person, signed in, so a forwarded link shows nothing more; leave it out for a link anyone can open, for someone not on Karwan yet. Ask who and how long when the user has not said. Give the user the link to send, and say they can stop it any time.",
      inputSchema: z.object({
        with: z.string().max(40).optional().describe('Karwan tag of the one person who may open it; omit for anyone with the link'),
        days: z.union([z.literal(1), z.literal(7)]).describe('1 for 24 hours, 7 for 7 days'),
      }),
      execute: async ({ with: withTag, days }) => {
        const r = await createShare(address, { withTag, hours: days === 7 ? 168 : 24 }, deps);
        if (!r.ok) return { shared: false, error: r.error };
        return {
          shared: true,
          link: r.link,
          for: r.share.viewerTag ? `@${r.share.viewerTag}, signed in` : 'anyone with the link',
          until: untilText(r.share.expiresAt),
          next: 'Send the link. You can stop it any time from your passport or by asking me.',
        };
      },
    }),

    my_passport_shares: tool({
      description: "List who can see the user's full passport right now, until when, and how many times each share was opened.",
      inputSchema: z.object({}),
      execute: async () => ({ shares: await listed() }),
    }),

    stop_passport_share: tool({
      description: "Stop a share of the user's full passport, by its id from my_passport_shares, or every share when all is true. The link then shows only the sealed passport.",
      inputSchema: z.object({ id: z.string().max(80).optional(), all: z.boolean().optional() }),
      execute: async ({ id, all }) => {
        const now = deps.now();
        const ids = all ? (await deps.live(address, now)).map((s) => s.id) : id ? [id] : [];
        if (ids.length === 0) return { stopped: 0, error: 'Say which share to stop, or stop them all.' };
        let stopped = 0;
        for (const one of ids) if (await deps.stop(address, one, now)) stopped++;
        return stopped ? { stopped } : { stopped: 0, error: 'That share has already ended.' };
      },
    }),
  };
}
