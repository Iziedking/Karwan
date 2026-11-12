import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { caseStore, type CaseChannel, type CaseMessage, type SupportCase } from './cases.js';
import { caseKindFromFacts, joinOrOpen, type CaseRecord } from './caseRules.js';

/// Today's support conversations, read and written as view 78's cases. The
/// website widget, Telegram, email and the desk keep this shape while the
/// cases underneath last: the conversation id is the case reference, and an
/// old `KSUP-` id still finds the case it was moved to.

export type SupportRole = 'user' | 'assistant' | 'operator' | 'system';

export interface SupportMessage {
  role: SupportRole;
  text: string;
  ts: number;
}

export interface SupportConversation {
  /// The case reference, KS-1042 or KT-1042.
  id: string;
  address?: string;
  email?: string;
  channel: 'widget' | 'email' | 'telegram';
  subject?: string;
  status: 'open' | 'closed';
  /// What the person can see: team notes and held replies are left out.
  messages: SupportMessage[];
  createdAt: number;
  updatedAt: number;
  closedAt?: number;
  dealIds: string[];
  keyHash?: string;
}

const ROLE: Record<CaseMessage['role'], SupportRole | null> = {
  person: 'user',
  bot: 'assistant',
  teammate: 'operator',
  system: 'system',
  note: null,
};

function toMessages(list: readonly CaseMessage[]): SupportMessage[] {
  return list.flatMap((m) => {
    const role = ROLE[m.role];
    return role ? [{ role, text: m.text, ts: m.at }] : [];
  });
}

async function view(c: SupportCase): Promise<SupportConversation> {
  return {
    id: c.ref,
    ...(c.address ? { address: c.address } : {}),
    ...(c.email ? { email: c.email } : {}),
    channel: c.lastChannel === 'web' ? 'widget' : c.lastChannel,
    ...(c.subject ? { subject: c.subject } : {}),
    status: c.state === 'solved' ? 'closed' : 'open',
    messages: toMessages(await caseStore().messages(c.id, { forPerson: true })),
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    ...(c.solvedAt ? { closedAt: c.solvedAt } : {}),
    dealIds: c.records.filter((r) => r.kind === 'deal').map((r) => r.id),
    ...(c.keyHash ? { keyHash: c.keyHash } : {}),
  };
}

/// A case by its reference, its id, or the `KSUP-` id it had before.
export async function findCase(idOrRef: string): Promise<SupportCase | null> {
  const store = caseStore();
  const hit = await store.get(idOrRef);
  if (hit) return hit;
  return /^KSUP-/i.test(idOrRef) ? store.byLegacyId(idOrRef) : null;
}

const asCaseRole = (role: 'user' | 'assistant'): 'person' | 'bot' => (role === 'user' ? 'person' : 'bot');

/// A person asks for someone from the website. Asking again about a deal
/// that already has a case joins that case, solved or not.
export async function createConversation(input: {
  address?: string;
  email?: string;
  dealId?: string;
  transcript: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<SupportConversation> {
  const store = caseStore();
  const now = Date.now();
  const lines = input.transcript.filter((t) => t.content.trim().length > 0).slice(-40);
  const records: CaseRecord[] = input.dealId ? [{ kind: 'deal', id: input.dealId }] : [];

  const joined = input.address ? joinOrOpen(await store.forPerson(input.address), records) : null;
  if (joined) {
    const c = (await store.get(joined))!;
    const last = lines.filter((l) => l.role === 'user').slice(-1)[0];
    await store.add(c.id, last
      ? { role: 'person', channel: 'web', text: last.content, at: now }
      : { role: 'system', channel: 'web', text: 'Asked for a person again from the website.', at: now });
    return view((await store.get(c.id))!);
  }

  const [first, ...rest] = lines;
  const c = await store.open({
    address: input.address,
    email: input.email,
    contactVerified: !!input.address,
    kind: caseKindFromFacts({ records, text: lines.filter((l) => l.role === 'user').map((l) => l.content).join(' ') }),
    records,
    channel: 'web',
    text: first?.content ?? 'Asked for a person from the website.',
    role: first ? asCaseRole(first.role) : 'system',
    now,
  });
  for (const l of rest) await store.add(c.id, { role: asCaseRole(l.role), channel: 'web', text: l.content, at: now });
  return view((await store.get(c.id))!);
}

const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

/// A fresh private key for a guest's case. Only its hash is kept.
export async function issueTicketKey(id: string): Promise<string | null> {
  const c = await findCase(id);
  if (!c) return null;
  const key = randomBytes(16).toString('hex');
  await caseStore().update(c.id, { keyHash: hashKey(key) });
  return key;
}

export function ticketKeyMatches(convo: Pick<SupportConversation, 'keyHash'>, key: string | undefined): boolean {
  if (!convo.keyHash || !key) return false;
  const a = Buffer.from(hashKey(key));
  const b = Buffer.from(convo.keyHash);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function getConversation(id: string): Promise<SupportConversation | null> {
  const c = await findCase(id);
  return c ? view(c) : null;
}

/// An email from someone. Until they prove the address is theirs while signed
/// in, the case is not tied to any account.
export async function createEmailConversation(input: { email: string; subject: string; text: string }): Promise<SupportConversation> {
  const store = caseStore();
  const c = await store.open({
    email: input.email,
    contactVerified: false,
    kind: caseKindFromFacts({ records: [], text: input.text }),
    records: [],
    channel: 'email',
    text: input.text,
    role: 'person',
    now: Date.now(),
  });
  return view(await store.update(c.id, { subject: input.subject }));
}

export async function listOpenConversations(): Promise<SupportConversation[]> {
  return Promise.all((await caseStore().queue({})).map(view));
}

export async function findOpenConversationByAddress(address: string): Promise<SupportConversation | null> {
  const [newest] = await caseStore().openFor(address);
  return newest ? view(newest) : null;
}

export async function appendUserMessage(id: string, text: string, channel: CaseChannel = 'web', subject?: string): Promise<SupportConversation | null> {
  const c = await findCase(id);
  if (!c) return null;
  await caseStore().add(c.id, { role: 'person', channel, text, at: Date.now() });
  if (subject) await caseStore().update(c.id, { subject });
  return view((await caseStore().get(c.id))!);
}

export async function attachDeal(id: string, jobId: string): Promise<SupportConversation | null> {
  const c = await findCase(id);
  if (!c) return null;
  if (c.records.some((r) => r.kind === 'deal' && r.id === jobId)) return view(c);
  return view(await caseStore().update(c.id, { records: [...c.records, { kind: 'deal', id: jobId }] }));
}

export async function appendOperatorMessage(id: string, text: string, memberId?: string): Promise<SupportConversation | null> {
  const c = await findCase(id);
  if (!c) return null;
  await caseStore().add(c.id, { role: 'teammate', channel: 'desk', text, at: Date.now(), ...(memberId ? { memberId } : {}) });
  return view((await caseStore().get(c.id))!);
}

export async function messagesSince(id: string, since: number): Promise<SupportMessage[]> {
  const c = await findCase(id);
  if (!c) return [];
  return toMessages((await caseStore().messages(c.id, { forPerson: true })).filter((m) => m.at > since));
}

export async function closeConversation(id: string): Promise<SupportConversation | null> {
  const c = await findCase(id);
  if (!c) return null;
  return view(await caseStore().update(c.id, { state: 'solved', solvedAt: Date.now() }));
}

export async function deleteConversationsFor(address: string): Promise<number> {
  return caseStore().deleteFor(address);
}
