/// The money cards ship beside the current ones. They are on when the build
/// flag is exactly "1", and either version can be forced per visit with
/// ?money=v2 or ?money=v1 so both can be reviewed live before switching.
/// `defaultOn` is for a page that moved to the new version for everyone (the
/// money page, view 44): only ?money=v1 opens the old one.
export function moneyV2Enabled(envFlag: string | undefined, search: string, defaultOn = false): boolean {
  const forced = new URLSearchParams(search).get('money');
  if (forced === 'v2') return true;
  if (forced === 'v1') return false;
  return defaultOn || envFlag === '1';
}
