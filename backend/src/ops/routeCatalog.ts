export type OperatorRouteAccess = 'admin' | 'support' | 'service' | 'application' | 'public';
export type OperatorRouteRisk = 'read' | 'change' | 'destructive' | 'ingress';

export interface RegisteredRoute {
  method: string;
  path: string;
}

export interface OperatorRouteRecord {
  id: string;
  method: string;
  path: string;
  family: string;
  access: OperatorRouteAccess;
  risk: OperatorRouteRisk;
}

function routeFamily(path: string): string {
  if (path === '/') return 'service';
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'api' && parts[1] === 'admin') return parts[2] || 'overview';
  if (parts[0] === 'api') return parts[1] || 'service';
  if (parts[0] === '.well-known' || parts[0] === 'schemas') return 'identity';
  return parts[0] || 'service';
}

function routeAccess(path: string): OperatorRouteAccess {
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

function routeRisk(method: string, access: OperatorRouteAccess): OperatorRouteRisk {
  if (access === 'service' && method !== 'GET' && method !== 'HEAD') return 'ingress';
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return 'read';
  if (method === 'DELETE') return 'destructive';
  return 'change';
}

/**
 * Build the operator-facing API inventory from Hono's live routing table.
 * Middleware registrations use method ALL and are intentionally omitted: the
 * catalog describes callable endpoints, while their access class remains a
 * concise operator aid rather than a replacement for backend authorization.
 */
export function buildOperatorRouteCatalog(
  registrations: readonly RegisteredRoute[],
): OperatorRouteRecord[] {
  const seen = new Set<string>();
  const records: OperatorRouteRecord[] = [];

  for (const registration of registrations) {
    const method = registration.method.toUpperCase();
    const path = registration.path || '/';
    if (method === 'ALL') continue;
    const id = `${method} ${path}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const access = routeAccess(path);
    records.push({
      id,
      method,
      path,
      family: routeFamily(path),
      access,
      risk: routeRisk(method, access),
    });
  }

  return records.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}
