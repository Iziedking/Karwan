import { answerContact, contactsOfFind } from './contacts.js';
import { findByJob } from './finds.js';

/// A seller's no thanks to a deal alert (view 72). Yes is an offer on the
/// request, which answers the alert on its own (alertsLive.onFindEvent).

export type DeclineResult = 'declined' | 'matched' | 'none';

export async function declineAlert(seller: string, jobId: string, now: number): Promise<DeclineResult> {
  const find = await findByJob(jobId);
  if (!find) return 'none';
  const me = seller.toLowerCase();
  const contact = (await contactsOfFind(find.id)).find((c) => c.kind === 'alert' && c.to === me);
  if (!contact) return 'none';
  if (find.status === 'matched') return 'matched';
  if (contact.answer !== null) return 'declined';
  return (await answerContact(contact.id, me, 'no', now)) ? 'declined' : 'none';
}
