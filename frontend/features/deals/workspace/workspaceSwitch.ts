/// The new deal page ships beside the current one. It is on when the build
/// flag is exactly "1", and either page can be forced per visit with
/// ?workspace=v2 or ?workspace=v1 so it can be reviewed live before switching.
export function workspaceEnabled(envFlag: string | undefined, search: string): boolean {
  const forced = new URLSearchParams(search).get('workspace');
  if (forced === 'v2') return true;
  if (forced === 'v1') return false;
  return envFlag === '1';
}
