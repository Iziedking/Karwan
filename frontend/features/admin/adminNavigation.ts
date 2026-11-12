export interface AdminNavigationItem {
  href: string;
  label: string;
  description: string;
  /// The desk page this item opens (view 64). 'owner' items are the owner's alone.
  page: string;
}

export interface AdminNavigationGroup {
  label: string;
  items: AdminNavigationItem[];
}

export const ADMIN_NAVIGATION: AdminNavigationGroup[] = [
  {
    label: 'Command',
    items: [
      { href: '/admin', label: 'Control room', description: 'Work queues and system posture', page: 'overview' },
      { href: '/admin/routes', label: 'API directory', description: 'Every mounted backend route', page: 'routes' },
      { href: '/admin/diagnostics', label: 'Diagnostics', description: 'Providers, jobs, contracts, wallets', page: 'diagnostics' },
      { href: '/admin/events', label: 'Event ledger', description: 'Trace operational activity', page: 'events' },
      { href: '/admin/errors', label: 'Error triage', description: 'Review and diagnose failures', page: 'errors' },
    ],
  },
  {
    label: 'Trade operations',
    items: [
      { href: '/admin/deals', label: 'Deals', description: 'Lifecycle and exceptions', page: 'deals' },
      { href: '/admin/disputes', label: 'Disputes', description: 'Prepare and collect rulings', page: 'disputes' },
      { href: '/admin/profiles', label: 'Profiles', description: 'Accounts and research access', page: 'profiles' },
      { href: '/admin/business', label: 'Business review', description: 'Verification decisions', page: 'business' },
      { href: '/admin/matching', label: 'Matching review', description: 'Evaluate recommended pairs', page: 'matching' },
    ],
  },
  {
    label: 'Agent operations',
    items: [
      { href: '/admin/runtime', label: 'Agent runtime', description: 'Tasks, parity and rollout gates', page: 'runtime' },
      { href: '/admin/payments', label: 'Payments', description: 'Agent payment evidence', page: 'payments' },
      { href: '/admin/signals', label: 'Signals', description: 'Research input queue', page: 'signals' },
      { href: '/admin/updates', label: 'Home updates', description: 'Cards on the signed-in home page', page: 'updates' },
    ],
  },
  {
    label: 'Funds',
    items: [
      { href: '/admin/treasury', label: 'Treasury', description: 'Balances and reviewed transfers', page: 'treasury' },
      { href: '/admin/usyc', label: 'USYC', description: 'Reserve and liquidity posture', page: 'usyc' },
    ],
  },
  {
    label: 'People and publishing',
    items: [
      { href: '/admin/support', label: 'Support', description: 'Customer cases', page: 'support' },
      { href: '/admin/support/room', label: 'Team room', description: 'Ask a teammate, case by case', page: 'support' },
      { href: '/admin/feedback', label: 'Feedback', description: 'Product feedback queue', page: 'feedback' },
      { href: '/admin/newsletter', label: 'Publishing', description: 'Draft, review and send', page: 'newsletter' },
      { href: '/admin/waitlist', label: 'Waitlist', description: 'Mainnet waitlist and invites', page: 'waitlist' },
      { href: '/admin/survey', label: 'Survey', description: 'Research survey answers', page: 'survey' },
      { href: '/admin/team', label: 'Team access', description: 'Members and invitations', page: 'owner' },
      { href: '/admin/team-keys', label: 'Team keys', description: 'Scoped machine access', page: 'owner' },
    ],
  },
  {
    label: 'Desk',
    items: [
      { href: '/admin/approvals', label: 'Approvals', description: 'Money moves waiting for a second member', page: 'member' },
      { href: '/admin/access', label: 'Desk access', description: 'Pages for each member', page: 'owner' },
      { href: '/admin/log', label: 'Change log', description: 'Every change made from the desk', page: 'log' },
      { href: '/admin/keys', label: 'Your keys', description: 'Keys for your scripts', page: 'member' },
    ],
  },
];

export interface DeskMe {
  owner: boolean;
  pages: string[];
}

export function canOpen(me: DeskMe, page: string): boolean {
  if (page === 'member') return true;
  if (me.owner) return true;
  return page !== 'owner' && me.pages.includes(page);
}

/// Only the pages the owner ticked for this member, plus their own keys.
export function adminNavigationFor(me: DeskMe): AdminNavigationGroup[] {
  return ADMIN_NAVIGATION
    .map((group) => ({ ...group, items: group.items.filter((item) => canOpen(me, item.page)) }))
    .filter((group) => group.items.length > 0);
}

/// Where a member lands: the first page they have.
export function firstDeskPage(me: DeskMe): string {
  return adminNavigationFor(me).flatMap((g) => g.items).find((i) => i.page !== 'member')?.href ?? '/admin/keys';
}

export function adminNavigationItem(pathname: string): AdminNavigationItem | null {
  const items = ADMIN_NAVIGATION.flatMap((group) => group.items);
  return items.find((item) => item.href === pathname)
    ?? items.find((item) => item.href !== '/admin' && pathname.startsWith(`${item.href}/`))
    ?? null;
}
