import { bus, type KarwanEvent } from '../events.js';
import { getBrief, patchBrief } from '../db/briefs.js';
import { getShortlist, getBuyerJob } from '../agents/buyer.js';
import { getProfile } from '../db/profiles.js';
import { getTelegramLink } from '../db/telegramLinks.js';
import { channelsFor } from '../channels/notifyVia.js';
import { sendTelegramMessage, telegramEnabled } from '../telegram/bot.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { agreedLine, agreedPick } from './requestUpdates.js';

/// "Agree for me" (view 30). When the shortlist of a request with the switch on
/// recommends a seller within budget, the agent has agreed for the buyer: the
/// assistant conversation shows it as its live update, and this sends the one
/// Telegram line, once per seller. No money moves: the buyer taps to lock it.

async function onShortlist(e: KarwanEvent): Promise<void> {
  if (e.type !== 'request.shortlist' || !e.jobId) return;
  const brief = getBrief(e.jobId);
  if (!brief?.agreeForMe) return;
  const budget = Number(getBuyerJob(e.jobId)?.budgetUsdc ?? NaN);
  if (!Number.isFinite(budget)) return;
  const pick = agreedPick(getShortlist(e.jobId) ?? [], budget);
  if (!pick || brief.agreedFor?.toLowerCase() === pick.seller.toLowerCase()) return;
  patchBrief(e.jobId, { agreedFor: pick.seller.toLowerCase() });
  if (!telegramEnabled()) return;
  const [link, profile] = await Promise.all([getTelegramLink(brief.postedBy), getProfile(brief.postedBy)]);
  if (!link || profile?.settings?.notificationsMuted || !channelsFor(profile?.settings, true).telegram) return;
  const base = config.FRONTEND_BASE_URL?.replace(/\/$/, '');
  await sendTelegramMessage(link.chatId, agreedLine(pick), base ? [{ text: 'Open in Karwan', url: `${base}/jobs/${e.jobId}` }] : undefined);
}

export function startAgreedForYou(): () => void {
  return bus.subscribe((e) => {
    void onShortlist(e).catch((err: Error) => logger.warn({ err: err.message, jobId: e.jobId }, 'agree for me: update failed'));
  });
}
