// Copied from cre/shared by scripts/cre-shared-sync.mjs. Edit cre/shared, then run the script.
/// Request headers the CRE gateway refuses outright ("blocked request: HTTP
/// header not allowed"), from defaultBlockedHeaders in smartcontractkit/chainlink
/// core/services/gateway/network/httpclient.go. The simulator does not apply
/// them; the deployed DON does. The gateway sends its own User-Agent, which is
/// what GitHub requires.
export const GATEWAY_BLOCKED_HEADERS = [
  'host',
  'content-length',
  'transfer-encoding',
  'user-agent',
  'upgrade',
  'expect',
  'connection',
  'keep-alive',
  'te',
  'trailer',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-real-ip',
];

export function githubHeaders(token: string): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    Authorization: `Bearer ${token}`,
  };
}
