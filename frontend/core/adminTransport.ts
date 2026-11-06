/// Desk calls go to admin.karwan.site's own proxy (view 64). They send only that
/// address's cookies, which is what lets Cloudflare Access see its sign-in, and
/// never the customer session cookie, which belongs to the API's address.
export function credentialsForApiRequest(
  headers: HeadersInit | undefined,
  requested: RequestCredentials | undefined,
): RequestCredentials {
  const requestHeaders = new Headers(headers);
  if (requestHeaders.has('x-admin-token') || requestHeaders.has('x-karwan-desk')) return 'same-origin';
  return requested ?? 'include';
}
