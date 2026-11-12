import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { caseStore, type CaseStore, type SupportCase } from '../support/cases.js';
import { caseKindFromFacts, type CaseRecord } from '../support/caseRules.js';

/// Moves the support tickets kept in data/support.json into cases (view 78).
/// Each ticket keeps its KSUP id as the case's old id, so a reply to an old
/// email thread still lands. Run once per server after deploy; running it
/// again moves nothing. DRY_RUN=1 counts without writing.
///
///   DRY_RUN=1 node dist/scripts/move-support-tickets.js
///   node dist/scripts/move-support-tickets.js

export interface LegacyTicket {
  id: string;
  address?: string;
  email?: string;
  channel?: 'widget' | 'email';
  subject?: string;
  status: 'open' | 'closed';
  messages: Array<{ role: 'user' | 'assistant' | 'operator' | 'system'; text: string; ts: number }>;
  createdAt: number;
  updatedAt: number;
  closedAt?: number;
  dealIds?: string[];
  keyHash?: string;
}

const ROLE = { user: 'person', assistant: 'bot', operator: 'teammate', system: 'system' } as const;

export async function moveTickets(
  tickets: readonly LegacyTicket[],
  store: CaseStore,
  opts: { dryRun: boolean },
): Promise<{ moved: number; skipped: number }> {
  let moved = 0;
  let skipped = 0;
  for (const t of tickets) {
    if (await store.byLegacyId(t.id)) {
      skipped++;
      continue;
    }
    moved++;
    if (opts.dryRun) continue;
    const records: CaseRecord[] = (t.dealIds ?? []).map((id) => ({ kind: 'deal', id }));
    const [first, ...rest] = t.messages.filter((m) => m.text.trim());
    const channel = t.channel === 'email' ? 'email' : 'web';
    const c = await store.open({
      address: t.address,
      email: t.email,
      contactVerified: !!t.address,
      kind: caseKindFromFacts({ records, text: t.messages.filter((m) => m.role === 'user').map((m) => m.text).join(' ') }),
      records,
      channel,
      text: first?.text ?? 'Moved from the earlier support inbox.',
      role: first && first.role !== 'operator' ? ROLE[first.role] as 'person' | 'bot' | 'system' : 'system',
      keyHash: t.keyHash,
      legacyId: t.id,
      now: t.createdAt,
    });
    for (const m of rest) {
      await store.add(c.id, { role: ROLE[m.role], channel: m.role === 'operator' ? 'desk' : channel, text: m.text, at: m.ts });
    }
    const patch: Partial<SupportCase> = { updatedAt: t.updatedAt };
    if (t.subject) patch.subject = t.subject;
    if (t.status === 'closed') Object.assign(patch, { state: 'solved', solvedAt: t.closedAt ?? t.updatedAt });
    await store.update(c.id, patch);
  }
  return { moved, skipped };
}

async function main(): Promise<void> {
  const file = resolve(process.cwd(), process.env.SUPPORT_FILE ?? 'data/support.json');
  if (!existsSync(file)) {
    console.log(`No ${file}; nothing to move.`);
    return;
  }
  const tickets = JSON.parse(readFileSync(file, 'utf8')) as LegacyTicket[];
  const dryRun = process.env.DRY_RUN === '1';
  const result = await moveTickets(tickets, caseStore(), { dryRun });
  console.log(`${dryRun ? 'Would move' : 'Moved'} ${result.moved} ticket(s); ${result.skipped} already moved.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().then(
    () => process.exit(0),
    (err) => {
      console.error((err as Error).message);
      process.exit(1);
    },
  );
}
