/// The admin desk's pages, and the routes each one brings (view 64). The owner
/// ticks pages per member; a member can call a route only when a ticked page
/// uses it. Access, team accounts and team keys belong to the owner alone. A
/// signed-in member can always read their own session and manage their own keys.

export interface AdminPage {
  key: string;
  label: string;
  routes: RegExp[];
}

const r = (s: string) => new RegExp(`^${s}$`);
const ANY = '[^/]+';

export const ADMIN_PAGES: AdminPage[] = [
  {
    key: 'overview',
    label: 'Overview',
    routes: [r('GET /api/admin/health'), r('GET /api/admin/assistant-health'), r('GET /api/admin/agents'), r('GET /api/admin/jobs'), r('GET /api/admin/proposals')],
  },
  {
    key: 'deals',
    label: 'Deals',
    routes: [r('\\w+ /api/admin/deals(/.*)?'), r('\\w+ /api/admin/reset-history'), r('\\w+ /api/admin/reputation(/.*)?'), r('\\w+ /api/admin/attestations(/.*)?')],
  },
  { key: 'disputes', label: 'Disputes', routes: [r('\\w+ /api/admin/disputes(/.*)?'), r('\\w+ /api/admin/pay-outside(/.*)?')] },
  { key: 'support', label: 'Support', routes: [r('\\w+ /api/admin/support(/.*)?')] },
  {
    key: 'profiles',
    label: 'Profiles',
    routes: [
      r('\\w+ /api/admin/profiles(/.*)?'),
      r('\\w+ /api/admin/account-deletions(/.*)?'),
      r('\\w+ /api/admin/verification(/.*)?'),
      r(`POST /api/listings/${ANY}/photos/clear`),
      r(`POST /api/listings/${ANY}/remove`),
    ],
  },
  { key: 'business', label: 'Business', routes: [r('\\w+ /api/admin/business(/.*)?'), r('POST /api/financier/admin/review')] },
  {
    key: 'diagnostics',
    label: 'Diagnostics',
    routes: [
      r('\\w+ /api/admin/agent-seed(/.*)?'),
      r('\\w+ /api/admin/deal-rules(/.*)?'),
      r('\\w+ /api/admin/older-contracts(/.*)?'),
      r('\\w+ /api/admin/reputation-debug(/.*)?'),
      r('\\w+ /api/admin/x402(/.*)?'),
      r('\\w+ /api/admin/market-seed(/.*)?'),
      r('GET /api/admin/health'),
      r('GET /api/admin/page-policy'),
    ],
  },
  { key: 'errors', label: 'Errors', routes: [r('\\w+ /api/admin/errors(/.*)?'), r('\\w+ /api/admin/diagnose(/.*)?')] },
  { key: 'events', label: 'Events', routes: [r('\\w+ /api/admin/events(/.*)?'), r('\\w+ /api/admin/agent-wallets(/.*)?')] },
  { key: 'payments', label: 'Payments', routes: [r('GET /api/admin/events(/.*)?')] },
  { key: 'matching', label: 'Matching', routes: [r('\\w+ /api/admin/agent-runtime/matching-shadow(/.*)?')] },
  {
    key: 'runtime',
    label: 'Agent runtime',
    routes: [r('\\w+ /api/admin/agent-runtime(/.*)?'), r('\\w+ /api/admin/reviewed-operation-ingress(/.*)?')],
  },
  { key: 'signals', label: 'Signals', routes: [r('\\w+ /api/admin/signals(/.*)?')] },
  { key: 'newsletter', label: 'Newsletter', routes: [r('\\w+ /api/admin/newsletter(/.*)?'), r('\\w+ /api/admin/email(/.*)?')] },
  { key: 'updates', label: 'Updates', routes: [r('\\w+ /api/admin/updates(/.*)?')] },
  { key: 'feedback', label: 'Feedback', routes: [r('GET /api/feedback'), r(`GET /api/feedback/${ANY}/asset/${ANY}`), r(`POST /api/feedback/${ANY}/status`)] },
  { key: 'survey', label: 'Survey', routes: [r('\\w+ /api/admin/research(/.*)?'), r('\\w+ /api/admin/form-limits(/.*)?')] },
  { key: 'waitlist', label: 'Waitlist', routes: [r('\\w+ /api/admin/waitlist(/.*)?'), r('\\w+ /api/admin/form-limits(/.*)?')] },
  { key: 'treasury', label: 'Treasury', routes: [r('\\w+ /api/admin/treasuries(/.*)?'), r('\\w+ /api/admin/treasury(/.*)?')] },
  { key: 'usyc', label: 'USYC', routes: [r('\\w+ /api/admin/usyc(/.*)?')] },
  { key: 'routes', label: 'Routes', routes: [r('GET /api/admin/route-catalog')] },
  { key: 'log', label: 'Change log', routes: [r('GET /api/admin/actions')] },
];

/// Routes only the owner may call, whatever pages a member has.
const OWNER_ONLY = [r('\\w+ /api/admin/access(/.*)?'), r('\\w+ /api/admin/team-members(/.*)?'), r('\\w+ /api/admin/team-keys(/.*)?')];

/// Routes any signed-in member may call: their own session, their own keys, and
/// the money requests list. Approving one also needs the page its route is on.
const ANY_MEMBER = [
  r('GET /api/admin/session'),
  r('\\w+ /api/admin/keys(/.*)?'),
  r('GET /api/admin/requests'),
  r(`POST /api/admin/requests/${ANY}/(approve|cancel)`),
];

export const ADMIN_PAGE_KEYS = new Set(ADMIN_PAGES.map((p) => p.key));

export type RouteRule = { kind: 'owner' } | { kind: 'member' } | { kind: 'pages'; pages: string[] } | { kind: 'none' };

export function routeRule(method: string, path: string): RouteRule {
  const line = `${method.toUpperCase()} ${path.replace(/\/+$/, '') || '/'}`;
  if (OWNER_ONLY.some((re) => re.test(line))) return { kind: 'owner' };
  if (ANY_MEMBER.some((re) => re.test(line))) return { kind: 'member' };
  const pages = ADMIN_PAGES.filter((p) => p.routes.some((re) => re.test(line))).map((p) => p.key);
  return pages.length ? { kind: 'pages', pages } : { kind: 'none' };
}

export function mayCall(who: { owner: boolean; pages: readonly string[] }, method: string, path: string): boolean {
  if (who.owner) return true;
  const rule = routeRule(method, path);
  if (rule.kind === 'member') return true;
  if (rule.kind !== 'pages') return false;
  return rule.pages.some((p) => who.pages.includes(p));
}

export function cleanPages(pages: readonly string[]): string[] {
  return [...new Set(pages.filter((p) => ADMIN_PAGE_KEYS.has(p)))].sort();
}
