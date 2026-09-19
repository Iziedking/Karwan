import { sendClientErrorReport } from '@/core/api';

const SEEN_KEY = 'karwan-reported-errors';

/// Reports a route error once per tab session. The deal boundary reloads the
/// page once to recover, which would otherwise send the same crash twice.
export function reportRouteError(
  error: Error & { digest?: string },
  boundary: 'app' | 'deal' | 'root',
): void {
  if (typeof window === 'undefined') return;
  const message = (error?.message || 'Unknown client error').slice(0, 500);
  const path = window.location.pathname;
  const fingerprint = `${boundary}|${path}|${message}`;
  try {
    const seen: string[] = JSON.parse(window.sessionStorage.getItem(SEEN_KEY) ?? '[]');
    if (seen.includes(fingerprint)) return;
    window.sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen, fingerprint].slice(-20)));
  } catch {
    // Storage unavailable: report anyway, duplicates beat silence.
  }
  sendClientErrorReport({
    message,
    ...(error?.digest ? { digest: error.digest.slice(0, 100) } : {}),
    path,
    boundary,
  });
}
