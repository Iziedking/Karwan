import { pgEnabled, postgresExecutor } from './client.js';

/// A Circle modular wallet (passkey smart account) and the email its owner
/// proved. Karwan holds no key for these accounts; this row only lets an email
/// identify the person behind an address, for notifications and sign-in.
export interface ModularAccount {
  address: string;
  email: string;
  createdAt: number;
}

export type LinkDecision =
  | { kind: 'create' }
  | { kind: 'exists' }
  | { kind: 'conflict'; reason: 'email_in_use' | 'address_has_email' };

/// One email per account and one account per email. Relinking the same pair is
/// a no-op, so a retried sign-in is harmless.
export function decideLink(
  address: string,
  email: string,
  byAddress: ModularAccount | null,
  byEmail: ModularAccount | null,
): LinkDecision {
  if (byAddress && byAddress.email === email) return { kind: 'exists' };
  if (byAddress) return { kind: 'conflict', reason: 'address_has_email' };
  if (byEmail && byEmail.address !== address) return { kind: 'conflict', reason: 'email_in_use' };
  return { kind: 'create' };
}

const mem = new Map<string, ModularAccount>();

interface Row extends Record<string, unknown> {
  address: string;
  email: string;
  created_at: string | number;
}

function fromRow(r: Row): ModularAccount {
  return { address: r.address, email: r.email, createdAt: Number(r.created_at) };
}

export async function getModularAccountByAddress(address: string): Promise<ModularAccount | null> {
  const a = address.toLowerCase();
  if (!pgEnabled) return mem.get(a) ?? null;
  const { rows } = await postgresExecutor().query<Row>(
    'SELECT address, email, created_at FROM modular_accounts_v1 WHERE address = $1',
    [a],
  );
  return rows[0] ? fromRow(rows[0]) : null;
}

export async function getModularAccountByEmail(email: string): Promise<ModularAccount | null> {
  const e = email.trim().toLowerCase();
  if (!pgEnabled) return [...mem.values()].find((m) => m.email === e) ?? null;
  const { rows } = await postgresExecutor().query<Row>(
    'SELECT address, email, created_at FROM modular_accounts_v1 WHERE email = $1',
    [e],
  );
  return rows[0] ? fromRow(rows[0]) : null;
}

export async function linkModularAccount(address: string, email: string): Promise<LinkDecision> {
  const a = address.toLowerCase();
  const e = email.trim().toLowerCase();
  const decision = decideLink(
    a,
    e,
    await getModularAccountByAddress(a),
    await getModularAccountByEmail(e),
  );
  if (decision.kind !== 'create') return decision;
  const row: ModularAccount = { address: a, email: e, createdAt: Date.now() };
  if (!pgEnabled) {
    mem.set(a, row);
    return decision;
  }
  // The unique constraints settle a race between two first sign-ins.
  const { rows } = await postgresExecutor().query(
    `INSERT INTO modular_accounts_v1 (address, email, created_at) VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING RETURNING address`,
    [a, e, row.createdAt],
  );
  return rows.length === 1 ? decision : { kind: 'conflict', reason: 'email_in_use' };
}
