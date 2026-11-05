import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { discoverRoutes, repoRoot } from './backendRoutes';
import { ALLOWED_WITHOUT_GUARD } from './pageRouteAllow';
import { apiCallsFromSource, classifyGuard, findRoute, pageProblems, type ApiCall, type BackendRoute, type PageCalls } from './pageRouteMap';

/// For every page and layout under frontend/app: the api.* calls it and the
/// files it imports make, the backend route each reaches and that route's
/// guard. --check fails on a call to a route that does not exist, on a
/// mutation with no guard that is not allowed with a reason, and on a stale
/// map. Without --check it writes docs/architecture/page-route-map.md.

const frontendRoot = path.join(repoRoot, 'frontend');
const appRoot = path.join(frontendRoot, 'app');
const apiPath = path.join(frontendRoot, 'core', 'api.ts');
const outputPath = path.join(repoRoot, 'docs', 'architecture', 'page-route-map.md');
const EXTENSIONS = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

function entryFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...entryFiles(full));
    else if (entry.name === 'page.tsx' || entry.name === 'layout.tsx') out.push(full);
  }
  return out;
}

function pageLabel(file: string): string {
  const rel = path.relative(appRoot, path.dirname(file)).split(path.sep).filter((s) => s && !/^\(.*\)$/.test(s));
  const route = `/${rel.join('/')}`;
  return path.basename(file) === 'layout.tsx' ? `${route} (layout)` : route;
}

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = path.join(frontendRoot, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec);
  else return null;
  if (isFileExact(base)) return base;
  for (const ext of EXTENSIONS) if (isFileExact(base + ext)) return base + ext;
  return null;
}

/// Exists with this exact case. Windows matches files case-insensitively and
/// Linux does not; the map must come out the same on both.
function isFileExact(file: string): boolean {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  return fs.readdirSync(path.dirname(file)).includes(path.basename(file));
}

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

interface FileFacts {
  imports: string[];
  apiNames: string[];
}

const facts = new Map<string, FileFacts>();
function factsOf(file: string): FileFacts {
  const cached = facts.get(file);
  if (cached) return cached;
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const imports = new Set<string>();
  const apiNames = new Set<string>();
  const visit = (node: ts.Node) => {
    let spec: string | null = null;
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      spec = node.moduleSpecifier.text;
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      spec = node.arguments[0].text;
    }
    if (spec) {
      const resolved = resolveImport(file, spec);
      if (resolved && resolved !== apiPath) imports.add(resolved);
    }
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'api') apiNames.add(node.name.text);
    node.forEachChild(visit);
  };
  visit(source);
  const out = { imports: [...imports], apiNames: [...apiNames] };
  facts.set(file, out);
  return out;
}

function apiNamesReached(entry: string): string[] {
  const seen = new Set<string>();
  const names = new Set<string>();
  const stack = [entry];
  while (stack.length) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const f = factsOf(file);
    f.apiNames.forEach((n) => names.add(n));
    stack.push(...f.imports);
  }
  return [...names].sort();
}

function cell(items: string[]): string {
  return items.length ? items.join('<br>') : '';
}

function render(pages: PageCalls[], api: Map<string, ApiCall[]>, routes: BackendRoute[]): string {
  const reached = new Set<string>();
  const unread = new Set<string>();
  const rows = pages.map(({ page, calls }) => {
    const reads = new Set<string>();
    const writes = new Set<string>();
    for (const name of calls) {
      const list = api.get(name);
      if (!list) { unread.add(name); continue; }
      for (const call of list) {
        const route = findRoute(call, routes);
        const label = route ? `${route.method} ${route.path} (${route.guard})` : `${call.method} ${call.path} (missing)`;
        if (route) reached.add(`${route.method} ${route.path}`);
        (call.method === 'GET' ? reads : writes).add(label);
      }
    }
    return `| \`${page}\` | ${cell([...reads].sort())} | ${cell([...writes].sort())} |`;
  });
  const allowed = Object.entries(ALLOWED_WITHOUT_GUARD).sort(([a], [b]) => byText(a, b));
  return [
    '# Page to route map',
    '',
    'Generated by `frontend/scripts/page-route-map.ts` from `frontend/app`, `frontend/core/api.ts` and `backend/src/index.ts`.',
    'Do not edit by hand. Run `npm run generate:page-routes --workspace=frontend`. CI runs `check:page-routes`, which fails',
    'when a page reaches a route the backend does not have, or a mutation with no guard that is not listed below with a reason.',
    '',
    `${pages.length} pages and layouts reach ${reached.size} of ${routes.length} backend routes through \`api.*\`.`,
    '',
    'Guard classes, read from the handler and the same-file helpers it calls: `admin` (operator token or team session),',
    '`step-up` (a fresh PIN, passkey or wallet confirmation), `session` (the signed-in cookie), `signed` (a signature,',
    'shared secret or payment proof), `token` (a link token or a one-time ticket is the credential), `limited` (public,',
    'rate limited only), `none` (no check found). A write marked `limited` or `none` must be listed below with a reason.',
    'A page counts every file it imports, so shared components such as the assistant appear on each page that renders them.',
    'Calls made with a raw `fetch` outside `api.*` are not in this map.',
    '',
    '| Page | Reads | Writes |',
    '|---|---|---|',
    ...rows,
    '',
    '## Mutations allowed without a guard',
    '',
    ...(allowed.length ? ['| Route | Why |', '|---|---|', ...allowed.map(([route, why]) => `| \`${route}\` | ${why} |`)] : ['None.']),
    '',
    '## api members with no request path read',
    '',
    unread.size ? [...unread].sort().map((n) => `\`${n}\``).join(', ') : 'None.',
    '',
  ].join('\n');
}

const routes: BackendRoute[] = discoverRoutes().map((r) => ({ method: r.method, path: r.path, guard: classifyGuard(r.handlerText, r.path) }));
const api = apiCallsFromSource(fs.readFileSync(apiPath, 'utf8'));
const pages: PageCalls[] = entryFiles(appRoot)
  .map((file) => ({ page: pageLabel(file), calls: apiNamesReached(file) }))
  .sort((a, b) => byText(a.page, b.page));
const rendered = render(pages, api, routes);

if (process.argv.includes('--check')) {
  const problems = pageProblems(pages, api, routes, new Map(Object.entries(ALLOWED_WITHOUT_GUARD)));
  for (const p of problems) console.error(`${p.problem}: ${p.page} calls api.${p.api} -> ${p.route}`);
  const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
  const stale = current !== rendered;
  if (stale) {
    const was = current.split('\n');
    const now = rendered.split('\n');
    const at = now.findIndex((line, i) => line !== was[i]);
    const line = at === -1 ? was.length : at;
    console.error('Page to route map is stale. Run npm run generate:page-routes --workspace=frontend.');
    console.error(`First difference at line ${line + 1}:\n  committed: ${(was[line] ?? '').slice(0, 300)}\n  generated: ${(now[line] ?? '').slice(0, 300)}`);
  }
  if (problems.length || stale) process.exitCode = 1;
  else console.log(`Page to route map is current (${pages.length} pages and layouts, no problems).`);
} else {
  fs.writeFileSync(outputPath, rendered);
  console.log(`Wrote ${path.relative(repoRoot, outputPath)} (${pages.length} pages and layouts).`);
}
