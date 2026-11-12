/// The desk's pages in plain words (view 79). Each page opens for the page keys
/// the server gates its routes by (backend/src/ops/adminPages.ts); a page with
/// no keys is every teammate's, an owner-only page is the owner's alone.

export type DeskLevel = 'read' | 'change' | 'fix';

export type DeskIcon =
  | 'home' | 'inbox' | 'life' | 'chat'
  | 'users' | 'building' | 'clipboard' | 'megaphone' | 'mail' | 'feedback'
  | 'deal' | 'scale' | 'arrows' | 'landmark'
  | 'shuffle' | 'bot'
  | 'activity' | 'alert' | 'history' | 'code'
  | 'shield' | 'key' | 'settings';

export type DeskBadge = 'waiting' | 'support' | 'room' | 'disputes';

export interface DeskItem {
  href: string;
  label: string;
  icon: DeskIcon;
  keys: string[];
  ownerOnly?: true;
  badge?: DeskBadge;
}

export interface DeskGroup {
  label: string;
  items: DeskItem[];
}

/// A part of a page that came from an older page, opened as a tab.
export interface DeskTab {
  key: string;
  label: string;
  keys: string[];
  ownerOnly?: true;
}

export interface DeskMe {
  owner: boolean;
  access: Record<string, DeskLevel>;
}

export const DESK_GROUPS: DeskGroup[] = [
  {
    label: 'Today',
    items: [
      { href: '/admin', label: 'Home', icon: 'home', keys: [] },
      { href: '/admin/waiting', label: 'Waiting for you', icon: 'inbox', keys: [], badge: 'waiting' },
      { href: '/admin/support', label: 'Support', icon: 'life', keys: ['support'], badge: 'support' },
      { href: '/admin/support/room', label: 'Team room', icon: 'chat', keys: ['support'], badge: 'room' },
    ],
  },
  {
    label: 'People',
    items: [
      { href: '/admin/accounts', label: 'Accounts', icon: 'users', keys: ['profiles'] },
      { href: '/admin/business', label: 'Businesses', icon: 'building', keys: ['business'] },
      { href: '/admin/waitlist', label: 'Waitlist and survey', icon: 'clipboard', keys: ['waitlist', 'survey'] },
      { href: '/admin/updates', label: 'Updates', icon: 'megaphone', keys: ['updates'] },
      { href: '/admin/newsletter', label: 'Newsletter', icon: 'mail', keys: ['newsletter'] },
      { href: '/admin/feedback', label: 'Feedback', icon: 'feedback', keys: ['feedback'] },
    ],
  },
  {
    label: 'Deals and money',
    items: [
      { href: '/admin/deals', label: 'Deals', icon: 'deal', keys: ['deals'] },
      { href: '/admin/disputes', label: 'Disputes', icon: 'scale', keys: ['disputes'], badge: 'disputes' },
      { href: '/admin/money', label: 'Money moves', icon: 'arrows', keys: ['payments'] },
      { href: '/admin/treasury', label: 'Treasury and yield', icon: 'landmark', keys: ['treasury', 'usyc'] },
    ],
  },
  {
    label: 'Market',
    items: [
      { href: '/admin/matching', label: 'Matching', icon: 'shuffle', keys: ['matching'] },
      { href: '/admin/agents', label: 'Agents', icon: 'bot', keys: ['runtime', 'signals'] },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/admin/health', label: 'Health', icon: 'activity', keys: ['diagnostics'] },
      { href: '/admin/errors', label: 'Errors', icon: 'alert', keys: ['errors'] },
      { href: '/admin/activity', label: 'Activity log', icon: 'history', keys: ['events', 'log'] },
      { href: '/admin/routes', label: 'API directory', icon: 'code', keys: ['routes'] },
    ],
  },
  {
    label: 'Team',
    items: [
      { href: '/admin/team', label: 'Team and pages', icon: 'shield', keys: [], ownerOnly: true },
      { href: '/admin/keys', label: 'Keys', icon: 'key', keys: [] },
      { href: '/admin/settings', label: 'Settings', icon: 'settings', keys: [], ownerOnly: true },
    ],
  },
];

/// Pages made of two older pages; each part opens for its own keys.
const DESK_TABS: Record<string, DeskTab[]> = {
  '/admin/money': [
    { key: 'moves', label: 'Money moves', keys: ['payments'] },
    { key: 'agents', label: 'Agent payments', keys: ['payments'] },
  ],
  '/admin/treasury': [
    { key: 'treasury', label: 'Treasury', keys: ['treasury'] },
    { key: 'yield', label: 'Yield', keys: ['usyc'] },
  ],
  '/admin/waitlist': [
    { key: 'waitlist', label: 'Waitlist', keys: ['waitlist'] },
    { key: 'survey', label: 'Survey', keys: ['survey'] },
  ],
  '/admin/agents': [
    { key: 'runtime', label: 'Agent runtime', keys: ['runtime'] },
    { key: 'signals', label: 'Signals', keys: ['signals'] },
  ],
  '/admin/activity': [
    { key: 'log', label: 'Desk changes', keys: ['log'] },
    { key: 'events', label: 'Market events', keys: ['events'] },
  ],
  '/admin/team': [
    { key: 'team', label: 'Team', keys: [], ownerOnly: true },
    { key: 'pages', label: 'Pages', keys: [], ownerOnly: true },
  ],
  '/admin/keys': [
    { key: 'yours', label: 'Your keys', keys: [] },
    { key: 'team', label: 'Team keys', keys: [], ownerOnly: true },
  ],
};

const RANK: Record<DeskLevel, number> = { read: 1, change: 2, fix: 3 };

/// The highest level the teammate has over these page keys; the owner has fix.
export function pageAccess(me: DeskMe, keys: readonly string[]): DeskLevel | null {
  if (me.owner) return 'fix';
  let best: DeskLevel | null = null;
  for (const key of keys) {
    const level = me.access[key];
    if (level && (!best || RANK[level] > RANK[best])) best = level;
  }
  return best;
}

function opens(me: DeskMe, part: { keys: readonly string[]; ownerOnly?: true }): boolean {
  if (part.ownerOnly) return me.owner;
  if (part.keys.length === 0) return true;
  return pageAccess(me, part.keys) !== null;
}

export function sidebarFor(me: DeskMe): DeskGroup[] {
  return DESK_GROUPS
    .map((group) => ({ ...group, items: group.items.filter((item) => opens(me, item)) }))
    .filter((group) => group.items.length > 0);
}

export function tabsFor(me: DeskMe, href: string): DeskTab[] {
  return (DESK_TABS[href] ?? []).filter((tab) => opens(me, tab));
}

/// The page an address belongs to: the exact page, else the longest page
/// address it sits under.
export function deskItemFor(pathname: string): DeskItem | null {
  const items = DESK_GROUPS.flatMap((group) => group.items);
  const exact = items.find((item) => item.href === pathname);
  if (exact) return exact;
  return items
    .filter((item) => item.href !== '/admin' && pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0] ?? null;
}

export function canOpenPath(me: DeskMe, pathname: string): boolean {
  const item = deskItemFor(pathname);
  return item ? opens(me, item) : false;
}

export interface DeskJump {
  label: string;
  group: string;
  href: string;
}

/// What the search box offers: the teammate's pages and the parts of them,
/// matched on plain words. An empty query lists every page they have.
export function jumpTo(me: DeskMe, query: string): DeskJump[] {
  const q = query.trim().toLowerCase();
  const out: DeskJump[] = [];
  for (const group of sidebarFor(me)) {
    for (const item of group.items) {
      if (!q || item.label.toLowerCase().includes(q)) out.push({ label: item.label, group: group.label, href: item.href });
      if (!q) continue;
      for (const tab of tabsFor(me, item.href)) {
        if (tab.label !== item.label && tab.label.toLowerCase().includes(q)) out.push({ label: `${item.label} · ${tab.label}`, group: group.label, href: `${item.href}?tab=${tab.key}` });
      }
    }
  }
  return out;
}
