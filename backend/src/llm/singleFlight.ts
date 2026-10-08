/// One model call for the same question asked at the same time. The live
/// watcher and the reconciler often reach a new request together, and both
/// used to pay for the same verdict before either could cache it.
export function singleFlight<T>(inflight: Map<string, Promise<T>>, key: string, work: () => Promise<T>): Promise<T> {
  const pending = inflight.get(key);
  if (pending) return pending;
  const run = work().finally(() => inflight.delete(key));
  inflight.set(key, run);
  return run;
}
