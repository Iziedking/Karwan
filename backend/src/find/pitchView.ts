import { getProfile } from '../db/profiles.js';
import type { DeliveryKind, DistanceLine } from '../location/rules.js';
import { livePitchDeps } from './alertsLive.js';
import type { Contact } from './contacts.js';
import { findOf } from './finds.js';
import { liveNeedsOf } from './needs.js';

export interface PitchView {
  id: string;
  what: string;
  kind: DeliveryKind;
  distance: DistanceLine;
  seller: { name: string; verified: boolean; stars: number | null; tag: string | null; photo: string | null };
  priceUsdc: string | null;
  days: number | null;
  note: string;
  sentAt: number;
  answer: Contact['answer'];
  jobId: string | null;
  closed: boolean;
}

/// What a buyer reads of a pitch: the need, the seller by name, the offer.
export async function pitchView(p: Contact): Promise<PitchView> {
  const [seller, find] = await Promise.all([livePitchDeps.seller(p.from), findOf(p.from, p.findId)]);
  const lead = find?.leads?.find((l) => l.kind === 'need' && l.ref === p.needId) ?? null;
  const need = lead ? null : (await liveNeedsOf([p.to])).find((n) => n.id === p.needId) ?? null;
  const profile = await getProfile(p.from).catch(() => null);
  const photo = (profile?.profileImageDataUrl || profile?.xProfileImageUrl)?.trim() || null;
  return {
    id: p.id,
    what: lead?.what ?? need?.what ?? '',
    kind: lead?.deliveryKind ?? need?.kind ?? 'remote',
    distance: lead?.distance ?? { key: 'unknown' },
    seller: { ...seller, tag: profile?.handle ?? null, photo },
    priceUsdc: p.offer?.priceUsdc ?? null,
    days: p.offer?.days ?? null,
    note: p.offer?.note ?? '',
    sentAt: p.sentAt,
    answer: p.answer,
    jobId: p.jobId ?? null,
    closed: p.closedAt !== null,
  };
}

