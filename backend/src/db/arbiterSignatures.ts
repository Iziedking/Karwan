import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const STORE_PATH = resolve(process.cwd(), 'data', 'arbiter-signatures.json');

/// One owner's signature over a specific arbiter Safe transaction.
///
/// Flat file rather than Postgres on purpose. These are short-lived: they exist
/// only between the first owner signing and the second one executing, and they
/// are worthless afterwards. A signature is also not secret, it is a public
/// authorisation over a specific nonce that anyone could broadcast.
export interface ArbiterSignature {
  jobId: string;
  /// Safe nonce the signature was made against. A signature is only valid for
  /// the nonce it was signed over: once the Safe executes anything its nonce
  /// moves and every stored signature for the old nonce is dead. Keyed here so
  /// stale ones are detected rather than assembled into a reverting call.
  safeNonce: string;
  signer: string;
  signature: string;
  /// The ruling this signature authorises. Both owners must be signing the SAME
  /// ruling: a signature is over the calldata, so differing bps or reasons
  /// produce different digests and simply will not combine.
  sellerBps: number;
  rulingHash: string;
  signedAt: number;
}

export async function listSignatures(jobId: string): Promise<ArbiterSignature[]> {
  const key = jobId.toLowerCase();
  return Object.values(loadFile()).filter((s) => s.jobId === key);
}

/// Record a signature. One per (jobId, signer, nonce): re-signing replaces the
/// previous one rather than stacking, so an owner who changes their mind about
/// the split does not leave a stale signature behind to be combined later.
export async function putSignature(sig: ArbiterSignature): Promise<void> {
  const store = loadFile();
  store[sigKey(sig.jobId, sig.signer, sig.safeNonce)] = {
    ...sig,
    jobId: sig.jobId.toLowerCase(),
    signer: sig.signer.toLowerCase(),
  };
  saveFile(store);
}

/// Drop every signature for a job. Called after a successful execution, and
/// whenever the stored ruling no longer matches what is being signed.
export async function clearSignatures(jobId: string): Promise<void> {
  const key = jobId.toLowerCase();
  const store = loadFile();
  for (const [k, v] of Object.entries(store)) {
    if (v.jobId === key) delete store[k];
  }
  saveFile(store);
}

function sigKey(jobId: string, signer: string, nonce: string): string {
  return `${jobId.toLowerCase()}:${signer.toLowerCase()}:${nonce}`;
}

function ensureFile() {
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(STORE_PATH)) writeFileSync(STORE_PATH, '{}', 'utf8');
}

function loadFile(): Record<string, ArbiterSignature> {
  ensureFile();
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf8')) as Record<string, ArbiterSignature>;
  } catch {
    return {};
  }
}

function saveFile(store: Record<string, ArbiterSignature>) {
  ensureFile();
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}
