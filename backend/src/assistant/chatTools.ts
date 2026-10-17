import { tool } from 'ai';
import { z } from 'zod';
import { getRecord } from '../db/evidence.js';
import { updateProfile } from '../db/profiles.js';
import { evidenceHashOf, type StoredFact } from '../verification/evidence.js';
import { addVerifiedFact } from '../verification/live.js';

/// Two things people ask for in chat: add a link to their record, and mute or
/// unmute alerts. A link is self-added evidence: it shows on the record and
/// agents can read it, but only verified items raise the score.

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_LINKS = 20;

export interface ChatToolDeps {
  now: () => number;
  newId: () => string;
  getFacts: (address: string) => Promise<StoredFact[]>;
  addFact: (address: string, fact: StoredFact) => Promise<boolean>;
  setMuted: (address: string, muted: boolean) => Promise<void>;
}

function normalizeLink(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'https:') return null;
    return `https://${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, '')}${u.search}`;
  } catch {
    return null;
  }
}

export function chatTools(address: string, deps: ChatToolDeps) {
  return {
    add_my_link: tool({
      description:
        "Add a link to the user's own Karwan record as self-added evidence: their shop, Instagram, LinkedIn, GitHub, a marketplace profile or a portfolio page. Use when they send or mention a link to their work. Say plainly that it shows on their record but only verified items raise their score; offer open_verification_step for checks that do.",
      inputSchema: z.object({ url: z.string().min(8).max(300) }),
      execute: async ({ url }) => {
        const link = normalizeLink(url);
        if (!link) return { saved: false, error: 'Only https links can be added.' };
        const links = (await deps.getFacts(address)).filter((f) => f.kind === 'shared_link' && f.revokedAt === undefined);
        if (links.length >= MAX_LINKS) return { saved: false, error: `Your record already holds ${MAX_LINKS} links.` };
        const now = deps.now();
        const saved = await deps.addFact(address, {
          id: deps.newId(),
          kind: 'shared_link',
          level: 'self_reported',
          source: 'chat',
          evidenceHash: evidenceHashOf('shared_link', link),
          issuedAt: now,
          expiresAt: now + YEAR_MS,
        });
        if (!saved) return { saved: false, note: 'That link is already on your record.' };
        return { saved: true, note: 'Saved as self-added. It shows on your record but only verified items raise your score.' };
      },
    }),

    set_chat_alerts: tool({
      description:
        "Turn the user's Karwan alerts off or on: deal, payment and message alerts here and by email. Use for 'mute alerts', 'stop notifications', 'turn alerts back on'.",
      inputSchema: z.object({ on: z.boolean() }),
      execute: async ({ on }) => {
        await deps.setMuted(address, !on);
        return { alerts: on ? ('on' as const) : ('off' as const) };
      },
    }),
  };
}

export const liveChatToolDeps: ChatToolDeps = {
  now: Date.now,
  newId: () => `link-${crypto.randomUUID()}`,
  getFacts: async (address) => (await getRecord<StoredFact[]>('facts', address.toLowerCase())) ?? [],
  addFact: addVerifiedFact,
  setMuted: async (address, muted) => {
    await updateProfile(address, (current) => ({ ...current, settings: { ...current.settings, notificationsMuted: muted } }));
  },
};
