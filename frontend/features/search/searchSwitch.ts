/// The new search pages ship beside the current ones. They are on when the
/// build flag is exactly "1", and either version can be forced with
/// ?search=v2 or ?search=v1 so both can be reviewed live before switching.
/// A forced choice is remembered for the browser session, so following a link
/// from one search page to the next keeps the version that was asked for.
export const SEARCH_CHOICE_KEY = 'karwan:search';

/// `defaultOn` is for a page that has moved to the new version for everyone
/// (the request page, view 44): only an asked-for v1 opens the old one.
export function searchV2Enabled(envFlag: string | undefined, search: string, remembered?: string | null, defaultOn = false): boolean {
  const choice = forcedSearchVersion(search) ?? (remembered === 'v1' || remembered === 'v2' ? remembered : null);
  if (choice === 'v2') return true;
  if (choice === 'v1') return false;
  return defaultOn || envFlag === '1';
}

export function forcedSearchVersion(search: string): 'v1' | 'v2' | null {
  const forced = new URLSearchParams(search).get('search');
  return forced === 'v1' || forced === 'v2' ? forced : null;
}
