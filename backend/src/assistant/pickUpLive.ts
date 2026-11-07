import { latestConversation } from '../db/assistantConversations.js';
import { sentFiles } from '../channels/sentFiles.js';
import { offerPhotos } from '../listings/photos.js';
import { deliveryPhotos } from '../deals/deliveryPhotos.js';
import { requestAttachments } from '../attachments/attachments.js';
import { entryFiles } from '../contests/entryFiles.js';
import { unfinishedWork, type HeldCounts, type PickUp } from './pickUp.js';

/// Files held for the person right now, by what they are for.
export function heldCountsOf(address: string, now: number): HeldCounts {
  return {
    sent: sentFiles.count(address, now),
    offer: offerPhotos.heldCount(address, now),
    delivery: deliveryPhotos.heldCount(address, now),
    request: requestAttachments.heldCount(address, now),
    entry: entryFiles.heldCount(address, now),
  };
}

/// What the person left unfinished, read live. The caller checks memory is on:
/// picking up reads past chats, so it stops when memory is off.
export async function readPickUp(address: string, now: number): Promise<PickUp | null> {
  const latest = await latestConversation(address);
  return unfinishedWork(latest, heldCountsOf(address, now), now);
}
