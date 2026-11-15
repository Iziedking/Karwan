/// The rows under Profile's first card (view 83): the account in one card,
/// settings and help in the next, each said once.
export type HubRow = 'security' | 'reach' | 'wallets' | 'business' | 'settings' | 'help';

export const PROFILE_PAGE_HREF: Record<HubRow, string> = {
  security: '/profile/security',
  reach: '/profile/contact',
  wallets: '/profile/wallets',
  business: '/profile/business',
  settings: '/settings',
  help: '/profile/help',
};

/// Business opens only where deals run.
export function hubAccountRows({ dealsAvailable }: { dealsAvailable: boolean }): HubRow[] {
  return dealsAvailable ? ['security', 'reach', 'wallets', 'business'] : ['security', 'reach', 'wallets'];
}

export const HUB_SETTINGS_ROWS: HubRow[] = ['settings', 'help'];
