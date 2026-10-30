/// Whether a money step that sends no Arc transaction of its own, such as
/// asking to be paid early, must first send the person's missing record steps
/// from their own wallet. A wallet Karwan holds is set up by the server on the
/// way, so only an own wallet with steps still missing answers yes.
export function recordFirst(status: { available: boolean; complete?: boolean; steps?: unknown[] } | null): boolean {
  if (!status || !status.available || status.complete) return false;
  return Array.isArray(status.steps) && status.steps.length > 0;
}
