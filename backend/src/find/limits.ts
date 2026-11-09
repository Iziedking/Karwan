/// How often people may be contacted from a find (view 72, spec "Limits").
/// Pure: the store gathers the counts inside the same locked write that
/// creates the contact, so a direct tool call or a second server cannot slip
/// past them.

export const LIMITS = {
  /// Deal alerts open at once on one find (Let me choose picks 1 to 3).
  alertsPerFind: 3,
  /// New people one buyer alerts in a day.
  buyerAlertsPerDay: 10,
  /// Alerts one seller receives in a day; more wait until the next day.
  sellerAlertsPerDay: 10,
  /// Pitches one buyer receives for one need in a day.
  buyerPitchesPerNeedPerDay: 3,
  /// Pitches one seller sends in a day.
  sellerPitchesPerDay: 10,
} as const;

export const DAY_MS = 86_400_000;
/// "Not now" on a pitch stops that seller for this long.
export const NOT_NOW_MS = 30 * DAY_MS;

export type LimitReason =
  | 'self'
  | 'blocked'
  | 'already_contacted'
  | 'find_full'
  | 'buyer_daily'
  | 'seller_pitch_daily'
  | 'buyer_pitch_daily'
  | 'not_interested'
  | 'not_now';

/// What the store read about the people involved, in the last day where it says so.
export interface ContactCounts {
  blocked: boolean;
  /// This sender already contacted this person for this find (alert) or need (pitch).
  alreadyContacted: boolean;
  /// Alerts on this find still waiting for an answer.
  openOnFind: number;
  /// Alerts this buyer sent in the last day.
  sentByBuyerToday: number;
  /// Alerts this seller received in the last day.
  receivedBySellerToday: number;
  /// Pitches this buyer received for this need in the last day.
  pitchesToNeedToday: number;
  /// Pitches this seller sent in the last day.
  pitchesBySellerToday: number;
  /// The buyer's last answer to this seller on this need, if any.
  lastPitchAnswer: { answer: 'no' | 'not_now'; at: number } | null;
}

export type Allowed = { ok: true; deliverAt: number } | { ok: false; reason: LimitReason };

export function allowedToContact(counts: ContactCounts, input: { kind: 'alert' | 'pitch'; from: string; to: string; now: number }): Allowed {
  const { now } = input;
  if (input.from.toLowerCase() === input.to.toLowerCase()) return { ok: false, reason: 'self' };
  if (counts.blocked) return { ok: false, reason: 'blocked' };
  if (counts.alreadyContacted) return { ok: false, reason: 'already_contacted' };
  if (input.kind === 'alert') {
    if (counts.openOnFind >= LIMITS.alertsPerFind) return { ok: false, reason: 'find_full' };
    if (counts.sentByBuyerToday >= LIMITS.buyerAlertsPerDay) return { ok: false, reason: 'buyer_daily' };
    // A seller with a full day still gets it, the next day.
    const deliverAt = counts.receivedBySellerToday >= LIMITS.sellerAlertsPerDay ? now + DAY_MS : now;
    return { ok: true, deliverAt };
  }
  if (counts.lastPitchAnswer?.answer === 'no') return { ok: false, reason: 'not_interested' };
  if (counts.lastPitchAnswer?.answer === 'not_now' && now - counts.lastPitchAnswer.at < NOT_NOW_MS) return { ok: false, reason: 'not_now' };
  if (counts.pitchesBySellerToday >= LIMITS.sellerPitchesPerDay) return { ok: false, reason: 'seller_pitch_daily' };
  if (counts.pitchesToNeedToday >= LIMITS.buyerPitchesPerNeedPerDay) return { ok: false, reason: 'buyer_pitch_daily' };
  return { ok: true, deliverAt: now };
}
