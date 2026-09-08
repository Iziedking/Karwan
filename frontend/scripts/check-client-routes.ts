// Read-only source audit. Pair with check:admin-routes so the backend snapshot
// is current. This checks method/path coverage, not auth or response contracts.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { BACKEND_ROUTE_SNAPSHOT } from '../features/admin/backendRouteSnapshot.generated';

const source = ts.createSourceFile('core/api.ts', readFileSync('core/api.ts', 'utf8'), ts.ScriptTarget.Latest, true);
function pathValue(node: ts.Expression | undefined): string | null {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isConditionalExpression(node)) {
    const yes = pathValue(node.whenTrue);
    const no = pathValue(node.whenFalse);
    if (yes?.startsWith('?') && no === '') return yes;
    return null;
  }
  if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map(span => `${pathValue(span.expression) ?? ':value'}${span.literal.text}`).join('');
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'withCaller') return pathValue(node.arguments[0]);
  return null;
}
const normalize = (path: string) => path.split('?')[0].replace(/\/$/, '').replace(/:[^/]+/g, ':value');
const known = new Set(BACKEND_ROUTE_SNAPSHOT.map(route => `${route.method} ${normalize(route.path)}`));
const missing: string[] = [];
const unexamined: string[] = [];
let checked = 0;
function visit(node: ts.Node) {
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'json') {
    const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    const path = pathValue(node.arguments[0]);
    let method = 'GET';
    const options = node.arguments[1];
    if (options && ts.isObjectLiteralExpression(options)) {
      const prop = options.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(source) === 'method');
      if (prop && ts.isPropertyAssignment(prop)) method = pathValue(prop.initializer) ?? 'DYNAMIC';
    } else if (options) method = 'DYNAMIC';
    if (!path || method === 'DYNAMIC') unexamined.push(`core/api.ts:${line} ${node.arguments[0]?.getText(source)}`);
    else {
      checked++;
      const key = `${method} ${normalize(path)}`;
      if (!known.has(key)) missing.push(`core/api.ts:${line} ${key}`);
    }
  }
  node.forEachChild(visit);
}
visit(source);
console.log(`Typed client: ${checked} literal/template requests checked; ${missing.length} missing method/path matches; ${unexamined.length} require manual inspection.`);
for (const entry of missing) console.log(`MISSING ${entry}`);
for (const entry of unexamined) console.log(`MANUAL ${entry}`);
console.log('Scope: json() calls in core/api.ts only. Direct fetch, local Next routes, payload validation, permissions and deployed availability require separate checks.');
if (missing.length || unexamined.length) process.exitCode = 1;
