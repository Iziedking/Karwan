import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head']);
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const backendRoot = path.join(repoRoot, 'backend', 'src');
const indexPath = path.join(backendRoot, 'index.ts');
const outputPath = path.join(repoRoot, 'frontend', 'features', 'admin', 'backendRouteSnapshot.generated.ts');

interface ImportBinding {
  importedName: string;
  sourcePath: string;
}

interface RouteEntry {
  method: string;
  path: string;
}

function sourceFile(filePath: string): ts.SourceFile {
  return ts.createSourceFile(
    filePath,
    fs.readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

function stringValue(node: ts.Node | undefined): string | null {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

function rootIdentifier(node: ts.Expression): string | null {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return rootIdentifier(node.expression);
  if (ts.isCallExpression(node)) return rootIdentifier(node.expression);
  return null;
}

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

function routeCalls(file: ts.SourceFile): Array<RouteEntry & { receiver: string | null }> {
  const routes: Array<RouteEntry & { receiver: string | null }> = [];
  walk(file, (node) => {
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return;
    const method = node.expression.name.text.toLowerCase();
    if (!METHODS.has(method)) return;
    const routePath = stringValue(node.arguments[0]);
    if (routePath === null) return;
    routes.push({
      method: method.toUpperCase(),
      path: routePath,
      receiver: rootIdentifier(node.expression.expression),
    });
  });
  return routes;
}

function factoryRouteReceivers(file: ts.SourceFile, exportedName: string): Set<string> {
  let factoryName: string | null = null;
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== exportedName) continue;
      if (declaration.initializer && ts.isCallExpression(declaration.initializer)) {
        const expression = declaration.initializer.expression;
        if (ts.isIdentifier(expression)) factoryName = expression.text;
      }
    }
  }
  if (!factoryName) return new Set();

  const receivers = new Set<string>();
  for (const statement of file.statements) {
    if (!ts.isFunctionDeclaration(statement) || statement.name?.text !== factoryName || !statement.body) continue;
    walk(statement.body, (node) => {
      if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name) || !node.initializer) return;
      if (
        ts.isNewExpression(node.initializer)
        && ts.isIdentifier(node.initializer.expression)
        && node.initializer.expression.text === 'Hono'
      ) receivers.add(node.name.text);
    });
  }
  return receivers;
}

function mountedRoutes(binding: ImportBinding): RouteEntry[] {
  const file = sourceFile(binding.sourcePath);
  const calls = routeCalls(file);
  const direct = calls.filter((route) => route.receiver === binding.importedName);
  if (direct.length > 0) return direct;

  const factoryReceivers = factoryRouteReceivers(file, binding.importedName);
  if (factoryReceivers.size > 0) {
    return calls.filter((route) => route.receiver && factoryReceivers.has(route.receiver));
  }

  throw new Error(`No route registrations found for ${binding.importedName} in ${binding.sourcePath}`);
}

function joinRoute(prefix: string, routePath: string): string {
  const left = prefix === '/' ? '' : prefix.replace(/\/$/, '');
  const right = routePath === '/' ? '' : routePath.startsWith('/') ? routePath : `/${routePath}`;
  return `${left}${right}` || '/';
}

function discoverRoutes(): RouteEntry[] {
  const index = sourceFile(indexPath);
  const imports = new Map<string, ImportBinding>();

  for (const statement of index.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (!statement.moduleSpecifier.text.startsWith('./routes/')) continue;
    const clause = statement.importClause?.namedBindings;
    if (!clause || !ts.isNamedImports(clause)) continue;
    const sourcePath = path.resolve(
      backendRoot,
      statement.moduleSpecifier.text.replace(/\.js$/, '.ts'),
    );
    for (const element of clause.elements) {
      imports.set(element.name.text, {
        importedName: element.propertyName?.text ?? element.name.text,
        sourcePath,
      });
    }
  }

  const routes: RouteEntry[] = [];
  walk(index, (node) => {
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return;
    if (!ts.isIdentifier(node.expression.expression) || node.expression.expression.text !== 'app') return;
    const operation = node.expression.name.text.toLowerCase();
    if (operation === 'route') {
      const prefix = stringValue(node.arguments[0]);
      const router = node.arguments[1];
      if (prefix === null || !router || !ts.isIdentifier(router)) return;
      const binding = imports.get(router.text);
      if (!binding) throw new Error(`Missing import binding for mounted router ${router.text}`);
      for (const route of mountedRoutes(binding)) {
        routes.push({ ...route, path: joinRoute(prefix, route.path) });
      }
      return;
    }
    if (!METHODS.has(operation)) return;
    const routePath = stringValue(node.arguments[0]);
    if (routePath !== null) routes.push({ method: operation.toUpperCase(), path: routePath });
  });

  const deduped = new Map<string, RouteEntry>();
  for (const route of routes) deduped.set(`${route.method} ${route.path}`, route);
  return [...deduped.values()].sort(
    (a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
  );
}

function render(routes: RouteEntry[]): string {
  const body = routes
    .map((route) => `  { method: ${JSON.stringify(route.method)}, path: ${JSON.stringify(route.path)} },`)
    .join('\n');
  return `// Generated by scripts/generate-admin-route-catalog.ts from backend/src/index.ts.\n`
    + `// Do not edit by hand. Run: npm run generate:admin-routes --workspace=frontend\n`
    + `export const BACKEND_ROUTE_SNAPSHOT = [\n${body}\n] as const;\n`;
}

const rendered = render(discoverRoutes());
if (process.argv.includes('--check')) {
  const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
  if (current !== rendered) {
    console.error('Admin route snapshot is stale. Run npm run generate:admin-routes --workspace=frontend.');
    process.exitCode = 1;
  } else {
    console.log(`Admin route snapshot is current (${discoverRoutes().length} endpoints).`);
  }
} else {
  fs.writeFileSync(outputPath, rendered);
  console.log(`Wrote ${discoverRoutes().length} endpoints to ${path.relative(repoRoot, outputPath)}.`);
}
