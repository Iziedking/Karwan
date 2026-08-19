export type SharedAuthMethod = 'web3' | 'circle';

export interface SharedAuthSession {
  address: string;
  method: SharedAuthMethod;
  email?: string;
  hasPasskey: boolean;
}

export interface SharedAuthSnapshot {
  session: SharedAuthSession | null;
  loaded: boolean;
}

export interface SharedAuthLoadResult {
  session: SharedAuthSession | null;
  profile?: unknown;
}

const SERVER_SNAPSHOT: SharedAuthSnapshot = { session: null, loaded: false };
let snapshot: SharedAuthSnapshot = SERVER_SNAPSHOT;
let inFlight: Promise<SharedAuthLoadResult> | null = null;
const listeners = new Set<() => void>();

function sessionsEqual(a: SharedAuthSession | null, b: SharedAuthSession | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.address === b.address &&
    a.method === b.method &&
    a.email === b.email &&
    a.hasPasskey === b.hasPasskey
  );
}

export function getAuthSessionSnapshot(): SharedAuthSnapshot {
  return snapshot;
}

export function getAuthSessionServerSnapshot(): SharedAuthSnapshot {
  return SERVER_SNAPSHOT;
}

export function subscribeAuthSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishAuthSession(
  session: SharedAuthSession | null,
  loaded = true,
): void {
  if (snapshot.loaded === loaded && sessionsEqual(snapshot.session, session)) return;
  snapshot = { session, loaded };
  for (const listener of listeners) listener();
}

/** One auth request serves every mounted useAuth consumer. */
export function loadAuthSessionOnce(
  loader: () => Promise<SharedAuthLoadResult>,
): Promise<SharedAuthLoadResult> {
  if (inFlight) return inFlight;
  inFlight = loader().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

export function resetAuthSessionStoreForTests(): void {
  snapshot = SERVER_SNAPSHOT;
  inFlight = null;
  listeners.clear();
}
