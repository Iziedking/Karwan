/// The new deal page is on when the build flag is exactly "1"; ?workspace=v2
/// shows it before then. Once it is on, only the workspace's own hand-off
/// (?workspace=v1&handoff=1, for a move it cannot make yet) opens the old page,
/// so a stale old-page link or bookmark lands on the new one.
export function workspaceEnabled(envFlag: string | undefined, search: string): boolean {
  const params = new URLSearchParams(search);
  const forced = params.get('workspace');
  if (forced === 'v2') return true;
  if (forced === 'v1' && (envFlag !== '1' || params.get('handoff') === '1')) return false;
  return envFlag === '1';
}
