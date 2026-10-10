import { evidenceHashOf, type StoredFact } from './evidence.js';

const TWO_YEARS_MS = 2 * 365 * 24 * 3_600_000;
/// One friendly client cannot build a whole record.
const MAX_CONFIRMATIONS_PER_CLIENT = 3;

export interface ConfirmRequest {
  id: string;
  subject: string;
  subjectName: string;
  clientHash: string;
  /// Kept only to receive this one message.
  clientTo: string;
  job: string;
  month: string;
  status: 'pending' | 'yes' | 'no';
  /// The invoice this confirmation backs, when it was asked about one.
  invoiceFactId?: string;
  createdAt: number;
  answeredAt?: number;
}

export interface ClientConfirmDeps {
  now: () => number;
  newId: () => string;
  hashNumber: (number: string) => string;
  /// The WhatsApp number behind an account, hashed, when it has one.
  numberHashOf: (address: string) => Promise<string | null>;
  getRequest: (id: string) => Promise<ConfirmRequest | null>;
  putRequest: (r: ConfirmRequest) => Promise<void>;
  listRequests: () => Promise<ConfirmRequest[]>;
  sendTemplate: (to: string, params: string[], buttonIds: string[]) => Promise<void>;
  /// Whether the client's own account has passed the person check.
  isPersonVerified: (clientHash: string) => Promise<boolean>;
  addFact: (address: string, fact: StoredFact) => Promise<boolean>;
  /// Marks a stored invoice fact as confirmed by its client.
  corroborate: (address: string, invoiceFactId: string) => Promise<void>;
}

export function createClientConfirm(deps: ClientConfirmDeps) {
  async function request(input: {
    subject: string;
    subjectName: string;
    clientNumber: string;
    job: string;
    month: string;
    invoiceFactId?: string;
  }): Promise<{ ok: true; requestId: string } | { ok: false; reason: 'own_number' | 'client_limit' }> {
    const subject = input.subject.toLowerCase();
    const clientTo = input.clientNumber.replace(/\D/g, '');
    const clientHash = deps.hashNumber(clientTo);
    if (clientHash === (await deps.numberHashOf(subject))) return { ok: false, reason: 'own_number' };

    const confirmed = (await deps.listRequests()).filter(
      (r) => r.subject === subject && r.clientHash === clientHash && r.status === 'yes',
    ).length;
    if (confirmed >= MAX_CONFIRMATIONS_PER_CLIENT) return { ok: false, reason: 'client_limit' };

    const id = deps.newId();
    await deps.putRequest({
      id,
      subject,
      subjectName: input.subjectName,
      clientHash,
      clientTo,
      job: input.job,
      month: input.month,
      status: 'pending',
      ...(input.invoiceFactId ? { invoiceFactId: input.invoiceFactId } : {}),
      createdAt: deps.now(),
    });
    await deps.sendTemplate(clientTo, [input.subjectName, input.job, input.month], [`cw:yes:${id}`, `cw:no:${id}`]);
    return { ok: true, requestId: id };
  }

  /// Only the asked number can answer, once. A No is kept against the claim
  /// and adds nothing to the record.
  async function answer(requestId: string, fromNumber: string, yes: boolean): Promise<StoredFact | null> {
    const r = await deps.getRequest(requestId);
    if (!r || r.status !== 'pending') return null;
    if (deps.hashNumber(fromNumber) !== r.clientHash) return null;
    const answeredAt = deps.now();
    await deps.putRequest({ ...r, status: yes ? 'yes' : 'no', answeredAt });
    if (!yes) return null;

    const fact: StoredFact = {
      id: `cw-${r.id}`,
      kind: 'client_confirmation',
      level: 'user_proof',
      issuedAt: answeredAt,
      expiresAt: answeredAt + TWO_YEARS_MS,
      independent: await deps.isPersonVerified(r.clientHash),
      evidenceHash: evidenceHashOf('client_confirmation', r.id, r.clientHash),
      source: 'whatsapp',
    };
    await deps.addFact(r.subject, fact);
    if (r.invoiceFactId) await deps.corroborate(r.subject, r.invoiceFactId);
    return fact;
  }

  return { request, answer };
}
