import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/// Every route backend/src/index.ts mounts, read from the source. The admin
/// route snapshot and the page to route map both use this.

const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head']);
const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '..', '..');
const backendRoot = path.join(repoRoot, 'backend', 'src');
const indexPath = path.join(backendRoot, 'index.ts');

interface ImportBinding {
  importedName: string;
  sourcePath: string;
}

export interface RouteEntry {
  method: string;
  path: string;
  /// The registration, the helpers it calls in its own file and the
  /// file-level middleware that covers it. Guards are read from this.
  handlerText: string;
}

interface RouteCall extends RouteEntry {
  receiver: string | null;
}

const files = new Map<string, ts.SourceFile>();
function sourceFile(filePath: string): ts.SourceFile {
  const cached = files.get(filePath);
  if (cached) return cached;
  const file = ts.createSourceFile(filePath, fs.readFileSync(filePath, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  files.set(filePath, file);
  return file;
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

const helperIndex = new Map<ts.SourceFile, Map<string, ts.Node>>();
/// Named functions anywhere in a file: function f() {} and const f = () => {}.
function helpersOf(file: ts.SourceFile): Map<string, ts.Node> {
  const cached = helperIndex.get(file);
  if (cached) return cached;
  const helpers = new Map<string, ts.Node>();
  walk(file, (node) => {
    if (ts.isFunctionDeclaration(node) && node.name) helpers.set(node.name.text, node);
    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.initializer
      && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) helpers.set(node.name.text, node);
  });
  helperIndex.set(file, helpers);
  return helpers;
}

/// The text of a registration plus every same-file helper it reaches, so a
/// handler that delegates (app.post('/x', (c) => step(c))) is read with step.
function textWithHelpers(file: ts.SourceFile, node: ts.Node): string {
  const helpers = helpersOf(file);
  const seen = new Set<ts.Node>();
  const parts: string[] = [];
  const visit = (n: ts.Node) => {
    if (seen.has(n)) return;
    seen.add(n);
    parts.push(n.getText(file));
    walk(n, (inner) => {
      if (!ts.isCallExpression(inner) || !ts.isIdentifier(inner.expression)) return;
      const helper = helpers.get(inner.expression.text);
      if (helper) visit(helper);
    });
  };
  visit(node);
  return parts.join('\n');
}

function routeCalls(file: ts.SourceFile): RouteCall[] {
  const routes: RouteCall[] = [];
  const uses: Array<{ receiver: string | null; path: string; text: string }> = [];
  walk(file, (node) => {
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return;
    const method = node.expression.name.text.toLowerCase();
    const receiver = rootIdentifier(node.expression.expression);
    if (method === 'use') {
      uses.push({ receiver, path: stringValue(node.arguments[0]) ?? '*', text: textWithHelpers(file, node) });
      return;
    }
    if (!METHODS.has(method)) return;
    const routePath = stringValue(node.arguments[0]);
    if (routePath === null) return;
    routes.push({ method: method.toUpperCase(), path: routePath, receiver, handlerText: textWithHelpers(file, node) });
  });
  for (const route of routes) {
    const covering = uses.filter((u) => u.receiver === route.receiver && covers(u.path, route.path));
    if (covering.length) route.handlerText = [...covering.map((u) => u.text), route.handlerText].join('\n');
  }
  return routes;
}

function covers(usePath: string, routePath: string): boolean {
  if (usePath === '*' || usePath === '/*') return true;
  const prefix = usePath.replace(/\/?\*$/, '');
  return routePath === prefix || routePath.startsWith(`${prefix}/`);
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
  return factoryName ? honoReceiversIn(file, factoryName) : new Set();
}

/// The Hono apps a factory function builds and returns.
function honoReceiversIn(file: ts.SourceFile, factoryName: string): Set<string> {
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

function mountedRoutes(binding: ImportBinding): RouteCall[] {
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

function relativeImports(file: ts.SourceFile, filePath: string): Map<string, ImportBinding> {
  const imports = new Map<string, ImportBinding>();
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (!statement.moduleSpecifier.text.startsWith('.')) continue;
    const clause = statement.importClause?.namedBindings;
    if (!clause || !ts.isNamedImports(clause)) continue;
    const sourcePath = path.resolve(
      path.dirname(filePath),
      statement.moduleSpecifier.text.replace(/\.js$/, '.ts'),
    );
    for (const element of clause.elements) {
      imports.set(element.name.text, {
        importedName: element.propertyName?.text ?? element.name.text,
        sourcePath,
      });
    }
  }
  return imports;
}

/// A router built from settings and mounted only when configured:
/// const x = await xRoutesFromEnv(); if (x) app.route('/api/x', x).
/// The builder returns a route factory's app, so its routes are that factory's.
function builtRoutes(binding: ImportBinding): RouteCall[] {
  const file = sourceFile(binding.sourcePath);
  const imports = relativeImports(file, binding.sourcePath);
  const routes: RouteCall[] = [];
  for (const statement of file.statements) {
    if (!ts.isFunctionDeclaration(statement) || statement.name?.text !== binding.importedName || !statement.body) continue;
    walk(statement.body, (node) => {
      if (!ts.isReturnStatement(node) || !node.expression || !ts.isCallExpression(node.expression)) return;
      if (!ts.isIdentifier(node.expression.expression)) return;
      const factory = imports.get(node.expression.expression.text);
      if (!factory) return;
      const factoryFile = sourceFile(factory.sourcePath);
      const receivers = honoReceiversIn(factoryFile, factory.importedName);
      routes.push(...routeCalls(factoryFile).filter((r) => r.receiver && receivers.has(r.receiver)));
    });
  }
  if (routes.length === 0) throw new Error(`No route factory returned by ${binding.importedName} in ${binding.sourcePath}`);
  return routes;
}

function joinRoute(prefix: string, routePath: string): string {
  const left = prefix === '/' ? '' : prefix.replace(/\/$/, '');
  const right = routePath === '/' ? '' : routePath.startsWith('/') ? routePath : `/${routePath}`;
  return `${left}${right}` || '/';
}

export function discoverRoutes(): RouteEntry[] {
  const index = sourceFile(indexPath);
  const allImports = relativeImports(index, indexPath);
  const routesDir = path.join(backendRoot, 'routes') + path.sep;
  const imports = new Map([...allImports].filter(([, binding]) => binding.sourcePath.startsWith(routesDir)));

  // Local names holding a router a builder returns: const x = await builder().
  const builtBy = new Map<string, string>();
  walk(index, (node) => {
    if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name) || !node.initializer) return;
    const call = ts.isAwaitExpression(node.initializer) ? node.initializer.expression : node.initializer;
    if (ts.isCallExpression(call) && ts.isIdentifier(call.expression)) builtBy.set(node.name.text, call.expression.text);
  });

  const routes: RouteEntry[] = [];
  const mount = (prefix: string, found: RouteCall[]) => {
    for (const route of found) routes.push({ method: route.method, path: joinRoute(prefix, route.path), handlerText: route.handlerText });
  };
  walk(index, (node) => {
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return;
    if (!ts.isIdentifier(node.expression.expression) || node.expression.expression.text !== 'app') return;
    const operation = node.expression.name.text.toLowerCase();
    if (operation === 'route') {
      const prefix = stringValue(node.arguments[0]);
      const router = node.arguments[1];
      if (prefix === null || !router) return;
      // A router built where it is mounted: app.route('/api/x', createXRoutes(deps)).
      if (ts.isCallExpression(router) && ts.isIdentifier(router.expression)) {
        const binding = imports.get(router.expression.text);
        if (!binding) throw new Error(`Missing import binding for router factory ${router.expression.text}`);
        const file = sourceFile(binding.sourcePath);
        const receivers = honoReceiversIn(file, binding.importedName);
        if (receivers.size === 0) throw new Error(`No Hono app built by ${binding.importedName} in ${binding.sourcePath}`);
        mount(prefix, routeCalls(file).filter((r) => r.receiver && receivers.has(r.receiver)));
        return;
      }
      if (!ts.isIdentifier(router)) return;
      const builder = builtBy.get(router.text);
      const built = builder ? allImports.get(builder) : undefined;
      if (!imports.has(router.text) && built) {
        mount(prefix, builtRoutes(built));
        return;
      }
      const binding = imports.get(router.text);
      if (!binding) throw new Error(`Missing import binding for mounted router ${router.text}`);
      mount(prefix, mountedRoutes(binding));
      return;
    }
    if (!METHODS.has(operation)) return;
    const routePath = stringValue(node.arguments[0]);
    if (routePath !== null) routes.push({ method: operation.toUpperCase(), path: routePath, handlerText: textWithHelpers(index, node) });
  });

  const deduped = new Map<string, RouteEntry>();
  for (const route of routes) deduped.set(`${route.method} ${route.path}`, route);
  return [...deduped.values()].sort(
    (a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
  );
}
