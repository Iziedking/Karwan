export interface AdminNavigationItem {
  href: string;
  label: string;
  description: string;
  support?: boolean;
}

export interface AdminNavigationGroup {
  label: string;
  items: AdminNavigationItem[];
}

export const ADMIN_NAVIGATION: AdminNavigationGroup[] = [
  {
    label: 'Command',
    items: [
      { href: '/admin', label: 'Control room', description: 'Work queues and system posture' },
      { href: '/admin/routes', label: 'API directory', description: 'Every mounted backend route' },
      { href: '/admin/diagnostics', label: 'Diagnostics', description: 'Providers, jobs, contracts, wallets' },
      { href: '/admin/events', label: 'Event ledger', description: 'Trace operational activity' },
      { href: '/admin/errors', label: 'Error triage', description: 'Review and diagnose failures' },
    ],
  },
  {
    label: 'Trade operations',
    items: [
      { href: '/admin/deals', label: 'Deals', description: 'Lifecycle and exceptions' },
      { href: '/admin/disputes', label: 'Disputes', description: 'Prepare and collect rulings' },
      { href: '/admin/profiles', label: 'Profiles', description: 'Accounts and research access' },
      { href: '/admin/business', label: 'Business review', description: 'Verification decisions' },
      { href: '/admin/matching', label: 'Matching review', description: 'Evaluate recommended pairs' },
    ],
  },
  {
    label: 'Agent operations',
    items: [
      { href: '/admin/runtime', label: 'Agent runtime', description: 'Tasks, parity and rollout gates' },
      { href: '/admin/payments', label: 'Payments', description: 'Agent payment evidence' },
      { href: '/admin/signals', label: 'Signals', description: 'Research input queue' },
    ],
  },
  {
    label: 'Funds',
    items: [
      { href: '/admin/treasury', label: 'Treasury', description: 'Balances and reviewed transfers' },
      { href: '/admin/usyc', label: 'USYC', description: 'Reserve and liquidity posture' },
    ],
  },
  {
    label: 'People and publishing',
    items: [
      { href: '/admin/support', label: 'Support', description: 'Customer conversations', support: true },
      { href: '/admin/feedback', label: 'Feedback', description: 'Product feedback queue' },
      { href: '/admin/newsletter', label: 'Publishing', description: 'Draft, review and send' },
      { href: '/admin/team', label: 'Team access', description: 'Members and invitations' },
      { href: '/admin/team-keys', label: 'Team keys', description: 'Scoped machine access' },
    ],
  },
];

export function adminNavigationForRole(role: 'admin' | 'support'): AdminNavigationGroup[] {
  if (role === 'admin') return ADMIN_NAVIGATION;
  return ADMIN_NAVIGATION
    .map((group) => ({ ...group, items: group.items.filter((item) => item.support) }))
    .filter((group) => group.items.length > 0);
}

export function adminNavigationItem(pathname: string): AdminNavigationItem | null {
  const items = ADMIN_NAVIGATION.flatMap((group) => group.items);
  return items.find((item) => item.href === pathname)
    ?? items.find((item) => item.href !== '/admin' && pathname.startsWith(`${item.href}/`))
    ?? null;
}
