export type WorkspaceNudgeKind = 'profile' | 'activation';

export const WORKSPACE_NUDGE_DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

export function chooseWorkspaceNudge(input: {
  profileResolved: boolean;
  hasProfile: boolean;
  activationResolved: boolean;
  activated: boolean;
}): WorkspaceNudgeKind | null {
  if (!input.profileResolved) return null;
  if (!input.hasProfile) return 'profile';
  if (!input.activationResolved) return null;
  if (!input.activated) return 'activation';
  return null;
}

export function workspaceNudgeDismissed(
  storedAt: string | null,
  now = Date.now(),
  ttlMs = WORKSPACE_NUDGE_DISMISS_MS,
): boolean {
  if (!storedAt) return false;
  const timestamp = Number(storedAt);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return false;
  return now - timestamp >= 0 && now - timestamp < ttlMs;
}
