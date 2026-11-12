import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pgEnabled, postgresExecutor } from '../db/client.js';
import type { SqlExecutor } from '../db/migrations.js';
import {
  firstReplyDue,
  refFor,
  type CaseKind,
  type CaseNetwork,
  type CaseRecord,
  type CaseState,
} from './caseRules.js';

/// Support cases that last (view 78). A case is kept in the database of the
/// network the person's account is on and is never deleted when solved; only
/// the person's own account deletion removes it. Team notes live with the case
/// and never reach the person.

export type CaseChannel = 'web' | 'telegram' | 'email';

export interface SupportCase {
  id: string;
  ref: string;
  /// The `KSUP-` id the ticket had before cases, so old email threads land.
  legacyId?: string;
  /// Lowercased.
  address?: string;
  email?: string;
  /// The last email subject, so a reply keeps its thread.
  subject?: string;
  /// False for an email from an address that is not yet tied to an account.
  contactVerified: boolean;
  kind: CaseKind;
  state: CaseState;
  lastChannel: CaseChannel;
  assignee?: string;
  /// The teammate asked by name to help.
  asked?: string;
  records: CaseRecord[];
  /// Money fixes asked for on the desk, each a view 64 request.
  fixes: Array<{ requestId: string; action: string }>;
  /// Hash of the private key a guest holds (view 68).
  keyHash?: string;
  dueAt: number;
  firstRepliedAt?: number;
  overdueSentAt?: number;
  /// When a person proved, while signed in, that an unsigned email case is theirs.
  proofAt?: number;
  createdAt: number;
  updatedAt: number;
  solvedAt?: number;
}

export type CaseRole = 'person' | 'bot' | 'teammate' | 'system' | 'note';

export interface CaseMessage {
  id: string;
  caseId: string;
  role: CaseRole;
  memberId?: string;
  channel: CaseChannel | 'desk';
  text: string;
  photos?: string[];
  deliveredVia?: string[];
  /// Set on a teammate reply that was not sent, with why.
  heldReason?: string;
  at: number;
}

export interface OpenCase {
  address?: string;
  email?: string;
  contactVerified: boolean;
  kind: CaseKind;
  records: CaseRecord[];
  channel: CaseChannel;
  text: string;
  role: 'person' | 'bot' | 'system';
  keyHash?: string;
  legacyId?: string;
  now: number;
}

export interface CaseStore {
  open(input: OpenCase): Promise<SupportCase>;
  /// By reference or id.
  get(refOrId: string): Promise<SupportCase | null>;
  byLegacyId(id: string): Promise<SupportCase | null>;
  /// Every case of a person, newest first.
  forPerson(address: string): Promise<SupportCase[]>;
  /// A person's cases that are not solved, newest first.
  openFor(address: string): Promise<SupportCase[]>;
  /// Unsolved cases (or one state), oldest due first.
  queue(filter: { state?: CaseState; asked?: string }): Promise<SupportCase[]>;
  add(caseId: string, msg: Omit<CaseMessage, 'id' | 'caseId'>): Promise<CaseMessage>;
  messages(caseId: string, opts: { forPerson: boolean }): Promise<CaseMessage[]>;
  /// Which channels took a teammate's reply.
  delivered(caseId: string, messageId: string, via: readonly string[]): Promise<void>;
  update(caseId: string, patch: Partial<SupportCase>): Promise<SupportCase>;
  deleteFor(address: string): Promise<number>;
}

function newCase(network: CaseNetwork, n: number, input: OpenCase): SupportCase {
  return {
    id: randomUUID(),
    ref: refFor(network, n),
    ...(input.legacyId ? { legacyId: input.legacyId } : {}),
    ...(input.address ? { address: input.address.toLowerCase() } : {}),
    ...(input.email ? { email: input.email.toLowerCase() } : {}),
    contactVerified: input.contactVerified,
    kind: input.kind,
    state: 'new',
    lastChannel: input.channel,
    records: input.records,
    fixes: [],
    ...(input.keyHash ? { keyHash: input.keyHash } : {}),
    dueAt: firstReplyDue(input.now),
    createdAt: input.now,
    updatedAt: input.now,
  };
}

function firstMessage(c: SupportCase, input: OpenCase): CaseMessage {
  return { id: randomUUID(), caseId: c.id, role: input.role, channel: input.channel, text: input.text, at: input.now };
}

/// What a new message does to its case.
function afterMessage(c: SupportCase, m: CaseMessage): SupportCase {
  const next: SupportCase = { ...c, updatedAt: Math.max(c.updatedAt, m.at) };
  if (m.role === 'teammate' && !m.heldReason) {
    next.state = 'waiting_person';
    next.firstRepliedAt ??= m.at;
    delete next.solvedAt;
  } else if (m.role === 'person') {
    next.state = 'waiting_us';
    delete next.solvedAt;
    if (m.channel !== 'desk') next.lastChannel = m.channel;
  }
  return next;
}

const seenByPerson = (m: CaseMessage) => m.role !== 'note' && !m.heldReason;

function merged(c: SupportCase, patch: Partial<SupportCase>): SupportCase {
  const next = { ...c, ...patch } as SupportCase & Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) if (v === undefined) delete next[k];
  return next;
}

/// Oldest due first; at the same due time, the case opened first.
const byDue = (a: SupportCase, b: SupportCase) =>
  a.dueAt - b.dueAt || a.createdAt - b.createdAt || Number(a.ref.slice(3)) - Number(b.ref.slice(3));

function inQueue(c: SupportCase, filter: { state?: CaseState; asked?: string }): boolean {
  if (filter.state ? c.state !== filter.state : c.state === 'solved') return false;
  return !filter.asked || c.asked === filter.asked;
}

export function memoryCaseStore(network: CaseNetwork): CaseStore {
  let n = 1000;
  const cases = new Map<string, SupportCase>();
  const msgs = new Map<string, CaseMessage[]>();
  const find = (refOrId: string) => cases.get(refOrId) ?? [...cases.values()].find((c) => c.ref === refOrId) ?? null;
  const newestFirst = (a: SupportCase, b: SupportCase) => b.updatedAt - a.updatedAt;
  return {
    async open(input) {
      const c = newCase(network, ++n, input);
      cases.set(c.id, c);
      msgs.set(c.id, [firstMessage(c, input)]);
      return c;
    },
    async get(refOrId) {
      return find(refOrId);
    },
    async byLegacyId(id) {
      return [...cases.values()].find((c) => c.legacyId === id) ?? null;
    },
    async forPerson(address) {
      return [...cases.values()].filter((c) => c.address === address.toLowerCase()).sort(newestFirst);
    },
    async openFor(address) {
      return (await this.forPerson(address)).filter((c) => c.state !== 'solved');
    },
    async queue(filter) {
      return [...cases.values()].filter((c) => inQueue(c, filter)).sort(byDue);
    },
    async add(caseId, msg) {
      const c = cases.get(caseId);
      if (!c) throw new Error('case_not_found');
      const m: CaseMessage = { ...msg, id: randomUUID(), caseId };
      msgs.get(caseId)!.push(m);
      cases.set(caseId, afterMessage(c, m));
      return m;
    },
    async messages(caseId, opts) {
      const list = msgs.get(caseId) ?? [];
      return opts.forPerson ? list.filter(seenByPerson) : [...list];
    },
    async delivered(caseId, messageId, via) {
      const m = msgs.get(caseId)?.find((x) => x.id === messageId);
      if (m) m.deliveredVia = [...via];
    },
    async update(caseId, patch) {
      const c = cases.get(caseId);
      if (!c) throw new Error('case_not_found');
      const next = merged(c, patch);
      cases.set(caseId, next);
      return next;
    },
    async deleteFor(address) {
      const mine = [...cases.values()].filter((c) => c.address === address.toLowerCase());
      for (const c of mine) {
        cases.delete(c.id);
        msgs.delete(c.id);
      }
      return mine.length;
    },
  };
}

type Row = { data: SupportCase };
type MsgRow = { data: CaseMessage };

export function postgresCaseStore(executor: SqlExecutor, network: CaseNetwork): CaseStore {
  async function write(c: SupportCase): Promise<void> {
    await executor.query(
      `UPDATE support_cases_v1 SET state = $2, due_at = $3, updated_at = $4, address = $5, data = $6 WHERE id = $1`,
      [c.id, c.state, c.dueAt, c.updatedAt, c.address ?? null, JSON.stringify(c)],
    );
  }
  async function one(sql: string, args: unknown[]): Promise<SupportCase | null> {
    const q = await executor.query(sql, args);
    return (q.rows[0] as Row | undefined)?.data ?? null;
  }
  const store: CaseStore = {
    async open(input) {
      const seq = await executor.query(`SELECT nextval('support_case_ref_seq') AS n`);
      const c = newCase(network, Number((seq.rows[0] as { n: string | number }).n), input);
      const m = firstMessage(c, input);
      await executor.query(
        `INSERT INTO support_cases_v1 (id, ref, legacy_id, address, state, due_at, updated_at, data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [c.id, c.ref, c.legacyId ?? null, c.address ?? null, c.state, c.dueAt, c.updatedAt, JSON.stringify(c)],
      );
      await executor.query(
        `INSERT INTO support_case_messages_v1 (id, case_id, at, role, data) VALUES ($1, $2, $3, $4, $5)`,
        [m.id, c.id, m.at, m.role, JSON.stringify(m)],
      );
      return c;
    },
    get(refOrId) {
      return one(`SELECT data FROM support_cases_v1 WHERE id = $1 OR ref = $1`, [refOrId]);
    },
    byLegacyId(id) {
      return one(`SELECT data FROM support_cases_v1 WHERE legacy_id = $1`, [id]);
    },
    async forPerson(address) {
      const q = await executor.query(`SELECT data FROM support_cases_v1 WHERE address = $1 ORDER BY updated_at DESC`, [address.toLowerCase()]);
      return (q.rows as Row[]).map((r) => r.data);
    },
    async openFor(address) {
      return (await store.forPerson(address)).filter((c) => c.state !== 'solved');
    },
    async queue(filter) {
      const q = filter.state
        ? await executor.query(`SELECT data FROM support_cases_v1 WHERE state = $1 ORDER BY due_at ASC`, [filter.state])
        : await executor.query(`SELECT data FROM support_cases_v1 WHERE state <> 'solved' ORDER BY due_at ASC`);
      return (q.rows as Row[]).map((r) => r.data).filter((c) => inQueue(c, filter)).sort(byDue);
    },
    async add(caseId, msg) {
      const c = await one(`SELECT data FROM support_cases_v1 WHERE id = $1`, [caseId]);
      if (!c) throw new Error('case_not_found');
      const m: CaseMessage = { ...msg, id: randomUUID(), caseId };
      await executor.query(
        `INSERT INTO support_case_messages_v1 (id, case_id, at, role, data) VALUES ($1, $2, $3, $4, $5)`,
        [m.id, caseId, m.at, m.role, JSON.stringify(m)],
      );
      await write(afterMessage(c, m));
      return m;
    },
    async messages(caseId, opts) {
      const q = await executor.query(`SELECT data FROM support_case_messages_v1 WHERE case_id = $1 ORDER BY at ASC`, [caseId]);
      const list = (q.rows as MsgRow[]).map((r) => r.data);
      return opts.forPerson ? list.filter(seenByPerson) : list;
    },
    async delivered(caseId, messageId, via) {
      await executor.query(
        `UPDATE support_case_messages_v1 SET data = data || jsonb_build_object('deliveredVia', $3::jsonb) WHERE id = $1 AND case_id = $2`,
        [messageId, caseId, JSON.stringify(via)],
      );
    },
    async update(caseId, patch) {
      const c = await one(`SELECT data FROM support_cases_v1 WHERE id = $1`, [caseId]);
      if (!c) throw new Error('case_not_found');
      const next = merged(c, patch);
      await write(next);
      return next;
    },
    async deleteFor(address) {
      const q = await executor.query(`DELETE FROM support_cases_v1 WHERE address = $1 RETURNING id`, [address.toLowerCase()]);
      const ids = (q.rows as Array<{ id: string }>).map((r) => r.id);
      if (ids.length) await executor.query(`DELETE FROM support_case_messages_v1 WHERE case_id = ANY($1)`, [ids]);
      return ids.length;
    },
  };
  return store;
}

let live: CaseStore | null = null;

export function caseStore(): CaseStore {
  live ??= pgEnabled ? postgresCaseStore(postgresExecutor(), config.ARC_NETWORK) : memoryCaseStore(config.ARC_NETWORK);
  return live;
}

/// Tests swap the live store.
export function useCaseStoreForTests(store: CaseStore): void {
  live = store;
}
