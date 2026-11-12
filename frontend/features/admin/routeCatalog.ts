import { BACKEND_ROUTE_SNAPSHOT } from './backendRouteSnapshot.generated';

export type AdminRouteAccess = 'admin' | 'support' | 'service' | 'application' | 'public';
export type AdminRouteRisk = 'read' | 'change' | 'destructive' | 'ingress';

export interface AdminRouteRecord {
  id: string;
  method: string;
  path: string;
  family: string;
  access: AdminRouteAccess;
  risk: AdminRouteRisk;
}

export interface AdminRouteCatalogResponse {
  generatedAt: number;
  source: 'runtime';
  count: number;
  routes: AdminRouteRecord[];
}

export type AdminWorkspace = { href: string; label: string };

function familyForPath(path: string): string {
  if (path === '/') return 'service';
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'api' && parts[1] === 'admin') return parts[2] || 'overview';
  if (parts[0] === 'api') return parts[1] || 'service';
  if (parts[0] === '.well-known' || parts[0] === 'schemas') return 'identity';
  return parts[0] || 'service';
}

function accessForPath(path: string): AdminRouteAccess {
  if (path.startsWith('/api/admin/support')) return 'support';
  if (path.startsWith('/api/admin')) return 'admin';
  if (
    path.startsWith('/api/circle/')
    || path.startsWith('/api/signals')
    || path.startsWith('/api/team-mcp')
    || path.startsWith('/oauth')
    || path.startsWith('/team/')
  ) return 'service';
  if (
    path === '/'
    || path === '/health'
    || path.startsWith('/.well-known')
    || path.startsWith('/schemas')
  ) return 'public';
  return 'application';
}

function riskForRoute(method: string, access: AdminRouteAccess): AdminRouteRisk {
  if (access === 'service' && method !== 'GET' && method !== 'HEAD') return 'ingress';
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return 'read';
  if (method === 'DELETE') return 'destructive';
  return 'change';
}

export function normalizeAdminRoute(method: string, path: string): AdminRouteRecord {
  const normalizedMethod = method.toUpperCase();
  const access = accessForPath(path);
  return {
    id: `${normalizedMethod} ${path}`,
    method: normalizedMethod,
    path,
    family: familyForPath(path),
    access,
    risk: riskForRoute(normalizedMethod, access),
  };
}

export const SOURCE_ROUTE_SNAPSHOT: AdminRouteRecord[] = BACKEND_ROUTE_SNAPSHOT.map(
  (route) => normalizeAdminRoute(route.method, route.path),
);

const workspaceRules: Array<[RegExp, AdminWorkspace]> = [
  [/^\/api\/admin\/support/, { href: '/admin/support', label: 'Support' }],
  [/^\/api\/admin\/agent-runtime/, { href: '/admin/agents', label: 'Agents' }],
  [/^\/api\/admin\/reviewed-operation-ingress/, { href: '/admin/agents', label: 'Agents' }],
  [/^\/api\/admin\/disputes/, { href: '/admin/disputes', label: 'Disputes' }],
  [/^\/api\/admin\/treasur/, { href: '/admin/treasury', label: 'Treasury and yield' }],
  [/^\/api\/admin\/usyc/, { href: '/admin/treasury?tab=yield', label: 'Treasury and yield' }],
  [/^\/api\/admin\/team-keys/, { href: '/admin/keys?tab=team', label: 'Keys' }],
  [/^\/api\/admin\/team-members/, { href: '/admin/team', label: 'Team and pages' }],
  [/^\/api\/admin\/signals/, { href: '/admin/agents?tab=signals', label: 'Agents' }],
  [/^\/api\/admin\/newsletter/, { href: '/admin/newsletter', label: 'Newsletter' }],
  [/^\/api\/admin\/waitlist/, { href: '/admin/waitlist', label: 'Waitlist and survey' }],
  [/^\/api\/admin\/research/, { href: '/admin/waitlist?tab=survey', label: 'Waitlist and survey' }],
  [/^\/api\/survey/, { href: '/admin/waitlist?tab=survey', label: 'Waitlist and survey' }],
  [/^\/api\/waitlist/, { href: '/admin/waitlist', label: 'Waitlist and survey' }],
  [/^\/api\/admin\/business/, { href: '/admin/business', label: 'Businesses' }],
  [/^\/api\/admin\/deals/, { href: '/admin/deals', label: 'Deals' }],
  [/^\/api\/admin\/profiles/, { href: '/admin/accounts', label: 'Accounts' }],
  [/^\/api\/admin\/events/, { href: '/admin/activity', label: 'Activity log' }],
  [/^\/api\/admin\/(errors|diagnose)/, { href: '/admin/errors', label: 'Errors' }],
  [/^\/api\/admin\/(health|assistant-health|agent-wallets|agent-seed)/, { href: '/admin/health', label: 'Health' }],
  [/^\/api\/admin\/(x402|payments)/, { href: '/admin/money', label: 'Money moves' }],
  [/^\/api\/(deals|trade|factoring|po-financing|financier|sme)/, { href: '/admin/deals', label: 'Deals' }],
  [/^\/api\/(profile|verification|partners|business)/, { href: '/admin/accounts', label: 'Accounts' }],
  [/^\/api\/(agents|jobs|listings|research)/, { href: '/admin/matching', label: 'Matching' }],
  [/^\/api\/(bridge|gateway|cashout|treasury|yield|deposit|balances|activity|vault)/, { href: '/admin/money', label: 'Money moves' }],
  [/^\/api\/support/, { href: '/admin/support', label: 'Support' }],
  [/^\/api\/feedback/, { href: '/admin/feedback', label: 'Feedback' }],
  [/^\/api\/(newsletter|x)/, { href: '/admin/newsletter', label: 'Newsletter' }],
];

export function workspaceForRoute(path: string): AdminWorkspace | null {
  return workspaceRules.find(([pattern]) => pattern.test(path))?.[1] ?? null;
}

export function filterAdminRoutes(
  routes: readonly AdminRouteRecord[],
  input: { query?: string; access?: AdminRouteAccess | 'all'; risk?: AdminRouteRisk | 'all' },
): AdminRouteRecord[] {
  const query = input.query?.trim().toLowerCase() ?? '';
  return routes.filter((route) => {
    if (input.access && input.access !== 'all' && route.access !== input.access) return false;
    if (input.risk && input.risk !== 'all' && route.risk !== input.risk) return false;
    if (!query) return true;
    const workspace = workspaceForRoute(route.path);
    return `${route.method} ${route.path} ${route.family} ${workspace?.label ?? ''}`
      .toLowerCase()
      .includes(query);
  });
}
