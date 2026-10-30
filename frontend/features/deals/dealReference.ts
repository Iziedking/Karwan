/// A deal's short reference (view 42): the first eight characters of its id,
/// in capitals and two groups, e.g. D68F-E7D8. The backend makes the same one
/// (`backend/src/deals/reference.ts`) and finds deals by it.

const FULL_ID = /^0x[0-9a-f]{64}$/i;

export function dealReference(jobId: string): string | null {
  if (!FULL_ID.test(jobId)) return null;
  const body = jobId.slice(2, 10).toUpperCase();
  return `${body.slice(0, 4)}-${body.slice(4)}`;
}

/// The deal a deal page is showing, so the Help panel can tell the assistant.
export function dealIdInPath(pathname: string | null): string | null {
  const m = pathname ? /\/deals\/(0x[0-9a-fA-F]{64})(?:\/|$)/.exec(pathname) : null;
  return m ? m[1]! : null;
}
