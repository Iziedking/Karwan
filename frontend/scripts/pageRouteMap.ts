import ts from 'typescript';

/// Which backend routes each page can reach through `api.*`, and the guard on
/// each. The CLI in page-route-map.ts feeds it the real source; tests feed it
/// fixtures.

export type Guard = 'admin' | 'step-up' | 'session' | 'signed' | 'token' | 'limited' | 'none';

export interface ApiCall {
  method: string;
  /// The request path with every substitution as ':' and no query string.
  path: string;
}

export interface BackendRoute {
  method: string;
  path: string;
  guard: Guard;
}

export interface PageCalls {
  page: string;
  calls: string[];
}

export interface Problem {
  page: string;
  api: string;
  route: string;
  problem: 'missing route' | 'mutation without a guard';
}

const REQUESTERS = new Set(['json', 'jsonOnce', 'fetch']);
const READS = new Set(['GET', 'HEAD', 'OPTIONS']);

/// What each method of `export const api = { ... }` requests. A method whose
/// path cannot be read statically is left out of its list.
export function apiCallsFromSource(source: string): Map<string, ApiCall[]> {
  const file = ts.createSourceFile('api.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const result = new Map<string, ApiCall[]>();
  const object = apiObject(file);
  if (!object) throw new Error('export const api = { ... } not found');
  for (const property of object.properties) {
    let name: string | null = null;
    let body: ts.Node | null = null;
    if (ts.isPropertyAssignment(property) && ts.isIdentifier(property.name)) {
      const init = property.initializer;
      if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
        name = property.name.text;
        body = init;
      }
    } else if (ts.isMethodDeclaration(property) && ts.isIdentifier(property.name)) {
      name = property.name.text;
      body = property;
    }
    if (!name || !body) continue;
    const calls: ApiCall[] = [];
    walk(body, (node) => {
      if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression) || !REQUESTERS.has(node.expression.text)) return;
      const raw = pathOf(node.arguments[0], body!);
      if (raw === null) return;
      const call = { method: methodOf(node.arguments[1]), path: normalisePath(raw) };
      if (!call.path.startsWith('/')) return;
      if (!calls.some((c) => c.method === call.method && c.path === call.path)) calls.push(call);
    });
    if (calls.length) result.set(name, calls);
  }
  return result;
}

function apiObject(file: ts.SourceFile): ts.ObjectLiteralExpression | null {
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const d of statement.declarationList.declarations) {
      if (ts.isIdentifier(d.name) && d.name.text === 'api' && d.initializer) {
        const init = ts.isAsExpression(d.initializer) || ts.isSatisfiesExpression(d.initializer) ? d.initializer.expression : d.initializer;
        if (ts.isObjectLiteralExpression(init)) return init;
      }
    }
  }
  return null;
}

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

/// Marks a substitution: '\u0000' between slashes is a path parameter, at the
/// end of a segment it is dropped (a query suffix such as `${qs}`).
const SUB = '\u0000';

function pathOf(expr: ts.Expression | undefined, scope: ts.Node, depth = 0): string | null {
  if (!expr || depth > 4) return null;
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text;
  if (ts.isParenthesizedExpression(expr)) return pathOf(expr.expression, scope, depth + 1);
  if (ts.isTemplateExpression(expr)) {
    let out = expr.head.text;
    for (const span of expr.templateSpans) {
      const e = span.expression;
      out += ts.isIdentifier(e) && e.text === 'BASE' ? '' : ts.isConditionalExpression(e) ? '' : SUB;
      out += span.literal.text;
    }
    return out;
  }
  if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = pathOf(expr.left, scope, depth + 1);
    return left === null ? null : left + (pathOf(expr.right, scope, depth + 1) ?? SUB);
  }
  if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression) && expr.expression.text === 'withCaller') {
    return pathOf(expr.arguments[0], scope, depth + 1);
  }
  if (ts.isIdentifier(expr)) {
    let found: ts.Expression | undefined;
    walk(scope, (node) => {
      if (!found && ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === expr.text) found = node.initializer;
    });
    return found ? pathOf(found, scope, depth + 1) : null;
  }
  return null;
}

function methodOf(init: ts.Expression | undefined): string {
  if (init && ts.isObjectLiteralExpression(init)) {
    for (const p of init.properties) {
      if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === 'method') {
        const v = p.initializer;
        if (ts.isStringLiteral(v) || ts.isNoSubstitutionTemplateLiteral(v)) return v.text.toUpperCase();
      }
    }
  }
  return 'GET';
}

export function normalisePath(raw: string): string {
  const noQuery = raw.split(/[?#]/)[0]!;
  const segments = noQuery.split('/').map((segment) => {
    if (!segment.includes(SUB)) return segment;
    const trimmed = segment.replace(new RegExp(`${SUB}+$`), '');
    return trimmed === '' || trimmed.includes(SUB) ? ':' : trimmed;
  });
  const joined = segments.join('/').replace(/\/+$/, '');
  return joined || '/';
}

/// The backend route a call reaches: the same method and shape, a parameter
/// on either side matching any segment, the most literal match first.
export function findRoute(call: ApiCall, routes: BackendRoute[]): BackendRoute | null {
  const parts = call.path.split('/');
  let best: BackendRoute | null = null;
  let bestScore = -1;
  for (const route of routes) {
    if (route.method !== call.method) continue;
    const want = route.path.split('/');
    if (want.length !== parts.length) continue;
    let score = 0;
    let ok = true;
    for (let i = 0; i < want.length; i++) {
      if (want[i] === parts[i]) score++;
      // A substitution in the call is a parameter: prefer a route parameter
      // there to a fixed segment such as /mine.
      else if (want[i]!.startsWith(':')) score += parts[i] === ':' ? 0.5 : 0;
      else if (parts[i] !== ':') { ok = false; break; }
    }
    if (ok && score > bestScore) { best = route; bestScore = score; }
  }
  return best;
}

export function pageProblems(pages: PageCalls[], api: Map<string, ApiCall[]>, routes: BackendRoute[], allowed: Map<string, string>): Problem[] {
  const problems: Problem[] = [];
  const seen = new Set<string>();
  const add = (p: Problem) => {
    const key = `${p.page} ${p.api} ${p.route}`;
    if (!seen.has(key)) { seen.add(key); problems.push(p); }
  };
  for (const page of pages) {
    for (const name of page.calls) {
      for (const call of api.get(name) ?? []) {
        const route = findRoute(call, routes);
        if (!route) {
          add({ page: page.page, api: name, route: `${call.method} ${call.path}`, problem: 'missing route' });
          continue;
        }
        const key = `${route.method} ${route.path}`;
        if (!READS.has(route.method) && (route.guard === 'none' || route.guard === 'limited') && !allowed.has(key)) {
          add({ page: page.page, api: name, route: key, problem: 'mutation without a guard' });
        }
      }
    }
  }
  return problems;
}

const ADMIN = ['requireAdmin', 'adminAuth', 'requireSupport', 'tokenRole', 'requireTeam', 'requireOwner', 'requireOperator', 'readTeamSession', 'teamSession'];
const STEP_UP = ['requirePresence', 'confirmMoveOut', 'presenceAction', 'reviewedOperation', 'X-Karwan-Confirm'];
const SESSION = [
  'readSession', 'sessionAddress', 'viewerAddress', 'isSessionSelf', 'deps.session', 'session(c)', 'who(c)', 'viewer(c)',
  'signedIn(c)', 'requireViewer', 'partyScope', 'not authenticated', 'authed', 'requireUserVerification', 'isSelf(',
];
const SIGNED = [
  'verifyWebhookSignature', 'timingSafeEqual', 'hmac', 'verifySignature', 'checkSignature', 'telegramSecret', 'verifyTelegram',
  'requirePayment', 'verifyProof', 'apiKey', 'requireKey',
];

/// The strongest guard the handler text shows. A write that is only rate
/// limited, or whose check lives in a helper in another file, needs an allow
/// line with a reason.
export function classifyGuard(handlerText: string, routePath: string): Guard {
  const has = (markers: string[]) => markers.some((m) => handlerText.includes(m));
  if (has(ADMIN)) return 'admin';
  if (has(STEP_UP)) return 'step-up';
  if (has(SESSION)) return 'session';
  if (has(SIGNED)) return 'signed';
  if (/\/:token(\/|$)/.test(routePath) || handlerText.includes('useTicket(') || handlerText.includes('ownTicket(')) return 'token';
  if (handlerText.includes('rateLimit(')) return 'limited';
  return 'none';
}
