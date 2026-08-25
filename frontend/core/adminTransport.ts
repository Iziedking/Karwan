export function credentialsForApiRequest(
  headers: HeadersInit | undefined,
  requested: RequestCredentials | undefined,
): RequestCredentials {
  const requestHeaders = new Headers(headers);
  if (requestHeaders.has('x-admin-token')) return 'omit';
  return requested ?? 'include';
}
