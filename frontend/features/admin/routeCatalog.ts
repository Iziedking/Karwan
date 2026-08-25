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
  [/^\/api\/admin\/support/, { href: '/admin/support', label: 'Support inbox' }],
  [/^\/api\/admin\/agent-runtime/, { href: '/admin/runtime', label: 'Agent runtime' }],
  [/^\/api\/admin\/reviewed-operation-ingress/, { href: '/admin/runtime', label: 'Agent runtime' }],
  [/^\/api\/admin\/disputes/, { href: '/admin/disputes', label: 'Dispute desk' }],
  [/^\/api\/admin\/treasur/, { href: '/admin/treasury', label: 'Treasury' }],
  [/^\/api\/admin\/usyc/, { href: '/admin/usyc', label: 'USYC controls' }],
  [/^\/api\/admin\/team-keys/, { href: '/admin/team-keys', label: 'Team keys' }],
  [/^\/api\/admin\/team-members/, { href: '/admin/team', label: 'Team access' }],
  [/^\/api\/admin\/signals/, { href: '/admin/signals', label: 'Signal queue' }],
  [/^\/api\/admin\/newsletter/, { href: '/admin/newsletter', label: 'Publishing' }],
  [/^\/api\/admin\/business/, { href: '/admin/business', label: 'Business review' }],
  [/^\/api\/admin\/deals/, { href: '/admin/deals', label: 'Deal operations' }],
  [/^\/api\/admin\/profiles/, { href: '/admin/profiles', label: 'Profiles' }],
  [/^\/api\/admin\/events/, { href: '/admin/events', label: 'Event ledger' }],
  [/^\/api\/admin\/(errors|diagnose)/, { href: '/admin/errors', label: 'Error triage' }],
  [/^\/api\/admin\/(health|assistant-health|agent-wallets|agent-seed)/, { href: '/admin/diagnostics', label: 'Diagnostics' }],
  [/^\/api\/admin\/(x402|payments)/, { href: '/admin/payments', label: 'Payments' }],
  [/^\/api\/(deals|trade|factoring|po-financing|financier|sme)/, { href: '/admin/deals', label: 'Deal operations' }],
  [/^\/api\/(profile|verification|partners|business)/, { href: '/admin/profiles', label: 'Profiles' }],
  [/^\/api\/(agents|jobs|listings|research)/, { href: '/admin/matching', label: 'Matching review' }],
  [/^\/api\/(bridge|gateway|cashout|treasury|yield|deposit|balances|activity|vault)/, { href: '/admin/payments', label: 'Payment operations' }],
  [/^\/api\/support/, { href: '/admin/support', label: 'Support inbox' }],
  [/^\/api\/feedback/, { href: '/admin/feedback', label: 'Feedback queue' }],
  [/^\/api\/(newsletter|x)/, { href: '/admin/newsletter', label: 'Publishing' }],
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
