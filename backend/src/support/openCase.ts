import { logger } from '../logger.js';
import { sendSupportAlertEmail } from '../emails/supportTranscript.js';
import { relaySupportUserMessage, sendSupportRequestToOperator } from '../telegram/bot.js';
import { caseKindFromFacts, joinOrOpen, outOfHoursLine, type CaseRecord } from './caseRules.js';
import { caseStore, type CaseChannel } from './cases.js';
import { ownRecord } from './ownRecord.js';
import { getConversation } from './store.js';

/// A signed-in person asks for someone (view 78), from the Help and support
/// page or through their assistant on any channel. A message about a deal or
/// transfer that already has a case joins it; anything else opens one. The
/// team is told either way.

export type OpenedCase =
  | { ok: true; ref: string; joined: boolean; dueAt: number; line: string; outOfHours: string | null }
  | { ok: false; reason: 'not_yours' };

export function caseLine(now: number, ref: string): string {
  return outOfHoursLine(now, ref) ?? `Case ${ref}. Someone from Karwan replies within 2 hours.`;
}

export async function tellTeam(ref: string, text: string, fresh: boolean): Promise<void> {
  const convo = await getConversation(ref);
  if (!convo) return;
  try {
    if (fresh) {
      await sendSupportRequestToOperator(convo);
      void sendSupportAlertEmail(convo);
    } else {
      await relaySupportUserMessage(convo, text);
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message, ref }, 'support: team alert failed');
  }
}

export async function openOrJoinCase(input: {
  address: string;
  text: string;
  records: readonly CaseRecord[];
  channel: CaseChannel;
  now?: number;
}): Promise<OpenedCase> {
  const me = input.address.toLowerCase();
  for (const r of input.records) {
    if (!(await ownRecord(me, r))) return { ok: false, reason: 'not_yours' };
  }
  const store = caseStore();
  const now = input.now ?? Date.now();
  const records = [...input.records];
  const joined = joinOrOpen(await store.forPerson(me), records);
  let ref: string;
  let dueAt: number;
  if (joined) {
    const k = (await store.get(joined))!;
    await store.add(k.id, { role: 'person', channel: input.channel, text: input.text, at: now });
    const after = (await store.get(k.id))!;
    ref = after.ref;
    dueAt = after.dueAt;
  } else {
    const k = await store.open({
      address: me,
      contactVerified: true,
      kind: caseKindFromFacts({ records, text: input.text }),
      records,
      channel: input.channel,
      text: input.text,
      role: 'person',
      now,
    });
    ref = k.ref;
    dueAt = k.dueAt;
  }
  void tellTeam(ref, input.text, !joined);
  return { ok: true, ref, joined: !!joined, dueAt, line: caseLine(now, ref), outOfHours: outOfHoursLine(now, ref) };
}
