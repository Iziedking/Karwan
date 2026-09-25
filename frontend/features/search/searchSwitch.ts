/// The new search pages ship beside the current ones. They are on when the
/// build flag is exactly "1", and either version can be forced per visit with
/// ?search=v2 or ?search=v1 so both can be reviewed live before switching.
export function searchV2Enabled(envFlag: string | undefined, search: string): boolean {
  const forced = new URLSearchParams(search).get('search');
  if (forced === 'v2') return true;
  if (forced === 'v1') return false;
  return envFlag === '1';
}
