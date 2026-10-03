/// The real HTTP surface and page map, read from source. The capability
/// registry is checked against this so the assistant can never cite an
/// endpoint or a page that does not exist.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('..', import.meta.url));
const FRONTEND_APP = fileURLToPath(new URL('../../../frontend/app', import.meta.url));

/// `METHOD /path` for every route mounted in index.ts, with Hono params kept
/// as `:name`.
export function backendEndpoints(): Set<string> {
  const index = readFileSync(join(SRC, 'index.ts'), 'utf8');
  const imports = new Map<string, string>();
  for (const m of index.matchAll(/import\s*\{([^}]+)\}\s*from\s*'\.\/routes\/([\w.-]+)\.js'/g)) {
    for (const name of m[1]!.split(',').map((n) => n.trim().split(/\s+as\s+/).pop()!).filter(Boolean)) {
      imports.set(name, m[2]!);
    }
  }
  const out = new Set<string>();
  for (const m of index.matchAll(/app\.route\('([^']*)',\s*(\w+)\)/g)) {
    const prefix = m[1] === '/' ? '' : m[1]!;
    const file = imports.get(m[2]!);
    if (!file) continue;
    const source = readFileSync(join(SRC, 'routes', `${file}.ts`), 'utf8');
    const re = new RegExp(`${m[2]}\\.(get|post|put|patch|delete)\\(\\s*'([^']*)'`, 'g');
    for (const r of source.matchAll(re)) {
      const path = r[2] === '/' ? prefix || '/' : `${prefix}${r[2]}`;
      out.add(`${r[1]!.toUpperCase()} ${path}`);
    }
  }
  return out;
}

/// Whether `/deals/0xabc` or `/deals/[id]` names a real Next.js page.
export function pageExists(href: string): boolean {
  const path = href.split(/[?#]/)[0]!;
  const segments = path.split('/').filter(Boolean);
  let dir = FRONTEND_APP;
  for (const segment of segments) {
    if (existsSync(join(dir, segment))) {
      dir = join(dir, segment);
      continue;
    }
    const dynamic = readdirSync(dir, { withFileTypes: true }).find((d) => d.isDirectory() && /^\[[^\]]+\]$/.test(d.name));
    if (!dynamic) return false;
    dir = join(dir, dynamic.name);
  }
  return existsSync(join(dir, 'page.tsx'));
}
