import { GetWebIdentityTokenCommand, STSClient } from '@aws-sdk/client-sts';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { logger } from '../logger.js';
import { singleFlight } from './singleFlight.js';

/// A pass for Claude at Anthropic with no stored key (view 89). The server
/// asks AWS for a signed note, trades it at Anthropic for a pass that lasts
/// minutes, and keeps one pass in memory. Neither the note nor the pass is
/// ever logged.

export type NoteSource = () => Promise<string>;

export interface PassSettings {
  ruleId: string;
  organizationId: string;
  workspaceId?: string;
  serviceAccountId?: string;
}

export interface PassDeps {
  note: NoteSource;
  fetch?: typeof fetch;
  now?: () => number;
}

export interface PassKeeper {
  get(): Promise<string>;
  expiresAt(): number | null;
}

/// Carries the HTTP status of a refused exchange, so the model chain rests the
/// link on a 401 or 403 the way it does for a refused key (view 81).
export class PassError extends Error {
  statusCode?: number;
  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'PassError';
    this.statusCode = statusCode;
  }
}

export const REFRESH_EARLY_MS = 120_000;
export const LAST_SAFE_MS = 30_000;

const TOKEN_URL = 'https://api.anthropic.com/v1/oauth/token';
const GRANT = 'urn:ietf:params:oauth:grant-type:jwt-bearer';

export function passKeeper(settings: PassSettings, deps: PassDeps): PassKeeper {
  const now = deps.now ?? Date.now;
  const send = deps.fetch ?? fetch;
  const inflight = new Map<string, Promise<string>>();
  let held: { token: string; expiresAt: number } | null = null;

  async function exchange(): Promise<string> {
    const assertion = await deps.note();
    const body: Record<string, string> = {
      grant_type: GRANT,
      assertion,
      federation_rule_id: settings.ruleId,
      organization_id: settings.organizationId,
    };
    if (settings.workspaceId) body.workspace_id = settings.workspaceId;
    if (settings.serviceAccountId) body.service_account_id = settings.serviceAccountId;
    const res = await send(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const out = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      error?: { message?: string };
    };
    if (!res.ok) {
      throw new PassError(`Anthropic refused the pass exchange (${res.status}): ${out.error?.message ?? 'no detail'}`, res.status);
    }
    if (!out.access_token || !out.expires_in) throw new PassError('Anthropic answered the pass exchange without a pass');
    held = { token: out.access_token, expiresAt: now() + out.expires_in * 1000 };
    logger.info({ expiresAt: new Date(held.expiresAt).toISOString() }, 'New pass for Claude at Anthropic');
    return held.token;
  }

  return {
    async get() {
      const t = now();
      if (held && held.expiresAt - t > REFRESH_EARLY_MS) return held.token;
      try {
        return await singleFlight(inflight, 'pass', exchange);
      } catch (e) {
        if (held && held.expiresAt - now() > LAST_SAFE_MS) {
          logger.warn({ err: (e as Error).message, expiresAt: new Date(held.expiresAt).toISOString() }, 'Pass refresh failed, still using the current pass');
          return held.token;
        }
        throw e;
      }
    },
    expiresAt: () => held?.expiresAt ?? null,
  };
}

export interface NoteRequest {
  Audience: string[];
  SigningAlgorithm: 'RS256';
  DurationSeconds: number;
}

/// Asks AWS, as the server's own role, for a fresh signed note each time.
/// The call exists only on regional STS endpoints, so a region is required.
export function stsNote(region: string, send?: (input: NoteRequest) => Promise<{ WebIdentityToken?: string }>): NoteSource {
  let client: STSClient | null = null;
  const ask =
    send ??
    ((input: NoteRequest) => {
      client ??= new STSClient({ region, credentials: fromNodeProviderChain() });
      return client.send(new GetWebIdentityTokenCommand(input));
    });
  return async () => {
    const out = await ask({ Audience: ['https://api.anthropic.com'], SigningAlgorithm: 'RS256', DurationSeconds: 900 });
    if (!out.WebIdentityToken) throw new Error('AWS answered with no note');
    return out.WebIdentityToken;
  };
}

/// A fetch for Claude at Anthropic that carries the pass in place of a key.
export function passFetch(keeper: PassKeeper, base: typeof fetch = fetch): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.delete('x-api-key');
    headers.set('authorization', `Bearer ${await keeper.get()}`);
    return base(input, { ...init, headers });
  }) as typeof fetch;
}
