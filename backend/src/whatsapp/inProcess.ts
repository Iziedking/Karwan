import { ARC } from '../chain/client.js';
import { COOKIE_NAME, signSession } from '../auth/session.js';

interface AppLike {
  request: (path: string, init?: RequestInit) => Response | Promise<Response>;
}

let app: AppLike | null = null;

/// index.ts hands its app over at startup. Chat actions then go through the
/// very routes, validation and authorization the web app uses.
export function installApp(a: AppLike): void {
  app = a;
}

export async function callAsAccount(
  address: string,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  if (!app) throw new Error('in-process app not installed');
  const who = address.toLowerCase();
  const token = signSession({ address: who, method: 'circle', chainId: ARC.chainId });
  const res = await app.request(path, {
    method,
    headers: {
      cookie: `${COOKIE_NAME}=${token}`,
      'content-type': 'application/json',
      'sec-fetch-site': 'same-origin',
      // Per-IP rate limits would otherwise put every chat account in one
      // bucket; each account gets its own.
      'x-real-ip': `chat:${who}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}
