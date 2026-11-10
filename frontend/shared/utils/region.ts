/// The country a visitor is in, as the request's region header gives it
/// (view 74). Only the two-letter country is kept, for a day, so prices can
/// read in local money before sign-in. It is never tied to an account.
export const REGION_COOKIE = 'karwan-region';

export function regionFromHeader(value: string | null | undefined): string | null {
  const code = (value ?? '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) && code !== 'XX' ? code : null;
}

export function regionFromCookie(cookie: string | null | undefined): string | null {
  const found = /(?:^|;\s*)karwan-region=([A-Za-z]{2})(?:;|$)/.exec(cookie ?? '');
  return found ? regionFromHeader(found[1]) : null;
}
