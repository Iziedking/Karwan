/// Cloudflare Access's pass on a request to the admin address (view 64), checked
/// with Web Crypto so it runs in the site's middleware. The backend checks the
/// same pass again on every admin call; this check keeps the desk's pages from
/// rendering for anything Cloudflare did not let through.

export interface AccessJwk {
  kty: string;
  kid?: string;
  n?: string;
  e?: string;
  alg?: string;
}

const SKEW_SECS = 60;

function b64urlBytes(part: string): Uint8Array<ArrayBuffer> {
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((part.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decode(part: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(new TextDecoder().decode(b64urlBytes(part)));
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function accessPassValid(
  token: string,
  keys: AccessJwk[],
  opts: { teamDomain: string; aud: string; nowMs: number },
): Promise<boolean> {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return false;
  const header = decode(parts[0]);
  const claims = decode(parts[1]);
  if (!header || !claims || header.alg !== 'RS256') return false;

  const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  let sig: Uint8Array<ArrayBuffer>;
  try {
    sig = b64urlBytes(parts[2]);
  } catch {
    return false;
  }
  const ordered = [...keys].sort((a, b) => Number(b.kid === header.kid) - Number(a.kid === header.kid));
  let signed = false;
  for (const jwk of ordered) {
    if (jwk.kty !== 'RSA') continue;
    try {
      const key = await crypto.subtle.importKey(
        'jwk',
        { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify'],
      );
      if (await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, data)) {
        signed = true;
        break;
      }
    } catch {
      continue;
    }
  }
  if (!signed) return false;

  const now = opts.nowMs / 1000;
  if (typeof claims.exp !== 'number' || claims.exp + SKEW_SECS < now) return false;
  if (typeof claims.nbf === 'number' && claims.nbf - SKEW_SECS > now) return false;
  if (claims.iss !== `https://${opts.teamDomain}`) return false;
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(opts.aud)) return false;
  const email = typeof claims.email === 'string' && claims.email.length > 0;
  const service = typeof claims.common_name === 'string' && claims.common_name.length > 0;
  return email || service;
}

const KEYS_TTL_MS = 10 * 60_000;
let cached: { keys: AccessJwk[]; at: number; team: string } | null = null;

export async function accessKeys(teamDomain: string, force = false): Promise<AccessJwk[]> {
  const now = Date.now();
  if (cached && cached.team === teamDomain && !force && now - cached.at < KEYS_TTL_MS) return cached.keys;
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`certs ${res.status}`);
  const body = (await res.json()) as { keys?: AccessJwk[] };
  if (!Array.isArray(body.keys)) throw new Error('certs without keys');
  cached = { keys: body.keys, at: now, team: teamDomain };
  return body.keys;
}
