import { pageAccess, type DeskLevel, type DeskMe } from './adminNavigation';

/// Treasury and yield is one page (view 79); each part shows only to a
/// teammate ticked for it, at their level.
export function treasurySections(me: DeskMe): { treasury: DeskLevel | null; yield: DeskLevel | null } {
  return { treasury: pageAccess(me, ['treasury']), yield: pageAccess(me, ['usyc']) };
}
