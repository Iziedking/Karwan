import { CONNECT_HOSTS, FRAME_HOSTS } from './cspHosts';

/// The page policy (view 70). Each load gets a fresh nonce: only scripts that
/// carry it run, plus the scripts those load ('strict-dynamic'). The page
/// talks only to itself, the API and the hosts in cspHosts.ts.

export type CspMode = 'report' | 'enforce';

export function cspMode(raw: string | undefined): CspMode {
  return raw?.trim().toLowerCase() === 'enforce' ? 'enforce' : 'report';
}

export function cspHeaderName(mode: CspMode): 'Content-Security-Policy' | 'Content-Security-Policy-Report-Only' {
  return mode === 'enforce' ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only';
}

export function makeNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/// Settings can name extra RPCs; only a clean http or websocket origin from
/// each is used, so a setting cannot widen the policy beyond one host.
export function originsOf(urls: (string | undefined)[]): string[] {
  const out = new Set<string>();
  for (const raw of urls) {
    if (!raw) continue;
    try {
      const url = new URL(raw.trim());
      if (['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) && url.origin !== 'null') out.add(url.origin);
    } catch {
      // not a URL
    }
  }
  return [...out];
}

export function buildCsp(o: { nonce: string; apiOrigin: string | null; extraConnect: string[]; reportUrl: string | null }): string {
  const connect = [...new Set(["'self'", ...(o.apiOrigin ? [o.apiOrigin] : []), ...o.extraConnect, ...CONNECT_HOSTS])];
  const rules: [string, string[]][] = [
    ['default-src', ["'self'"]],
    // 'self', https: and 'unsafe-inline' are ignored by browsers that honour the
    // nonce and 'strict-dynamic'; they keep very old browsers working.
    ['script-src', [`'nonce-${o.nonce}'`, "'strict-dynamic'", "'wasm-unsafe-eval'", "'self'", 'https:', "'unsafe-inline'"]],
    ['style-src', ["'self'", "'unsafe-inline'"]],
    ['img-src', ["'self'", 'data:', 'blob:', 'https:']],
    ['font-src', ["'self'", 'data:']],
    ['media-src', ["'self'", 'data:', 'blob:']],
    ['connect-src', connect],
    ['frame-src', ["'self'", ...FRAME_HOSTS]],
    ['worker-src', ["'self'", 'blob:']],
    ['manifest-src', ["'self'"]],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
    ['frame-ancestors', ["'none'"]],
  ];
  if (o.reportUrl) {
    rules.push(['report-uri', [o.reportUrl]], ['report-to', ['csp']]);
  }
  return rules.map(([name, values]) => `${name} ${values.join(' ')}`).join('; ');
}
