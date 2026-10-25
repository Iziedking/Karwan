import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COVERAGE, PLANNED_CEILING } from './coverage.js';
import { ROUTES } from '../channels/executor.js';

/// View 31: everything a person can do in the app is either run by the
/// assistant, kept on the page for a written reason, internal, or planned, and
/// the planned list only shrinks.

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const read = (path: string) => readFileSync(join(repo, path), 'utf8');

const shape = (path: string) => path.replace(/\$\{[^}]+\}/g, ':').replace(/:[A-Za-z_]+/g, ':');

/// Each request in the app's API client that changes something, as "METHOD /path".
function appActions(): Map<string, string> {
  const source = read('frontend/core/api.ts');
  const out = new Map<string, string>();
  const starts = [...source.matchAll(/\n {2}(\w+): (?:async )?\(/g)];
  starts.forEach((m, i) => {
    const body = source.slice(m.index! + m[0].length, starts[i + 1]?.index ?? source.length).slice(0, 1200);
    const method = /method: '(POST|DELETE|PATCH|PUT)'/.exec(body)?.[1];
    const path = /[`'](\/api\/[^`'?]+)/.exec(body)?.[1];
    if (!method || !path || path.startsWith('/api/admin')) return;
    const key = `${method} ${shape(path)}`;
    if (!out.has(key)) out.set(key, m[1]!);
  });
  return out;
}

/// The confirm intents the website runs, from the action type the app reads.
function websiteIntents(): Set<string> {
  const source = read('frontend/core/api.ts');
  const block = /export interface AssistantConfirmAction \{[\s\S]*?intent:([\s\S]*?);/.exec(source)?.[1] ?? '';
  return new Set([...block.matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1]!));
}

function assistantSources(): string {
  const dirs = ['backend/src/assistant', 'backend/src/channels'];
  return dirs
    .flatMap((d) => readdirSync(join(repo, d)).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts')).map((f) => read(`${d}/${f}`)))
    .join('\n');
}

test('every action in the app has its place in the coverage map', () => {
  const actions = appActions();
  assert.ok(actions.size > 100, `only ${actions.size} actions read from frontend/core/api.ts; the parser has drifted`);
  const missing = [...actions.keys()].filter((k) => !(k in COVERAGE));
  assert.deepEqual(missing, [], `Add these to backend/src/assistant/coverage.ts (assistant, page with a reason, internal, or planned):\n${missing.join('\n')}`);
  const stale = Object.keys(COVERAGE).filter((k) => !actions.has(k));
  assert.deepEqual(stale, [], `No longer in the app, remove from coverage.ts:\n${stale.join('\n')}`);
});

test('every assistant entry is backed by a runner, a tool or the hand-over marker', () => {
  const sources = assistantSources();
  const chat = new Set(Object.keys(ROUTES));
  const website = websiteIntents();
  const unbacked = Object.entries(COVERAGE)
    .filter(([, c]) => c.by === 'assistant')
    .map(([route, c]) => [route, (c as { via: string }).via] as const)
    .filter(([, via]) =>
      via.startsWith('[[')
        ? !sources.includes(via)
        : !(chat.has(via) || website.has(via) || sources.includes(`${via}: tool(`)),
    );
  assert.deepEqual(unbacked, [], 'These assistant entries name an intent or tool that does not exist');
});

test("every route the chat runner calls is marked as the assistant's in the map", () => {
  const placeholder = new Proxy({}, { get: () => ':' }) as Record<string, unknown>;
  const unmarked: string[] = [];
  for (const [intent, step] of Object.entries(ROUTES)) {
    const { method, path } = step!(placeholder, { id: 'coverage' } as never);
    const key = `${method} ${shape(path)}`;
    // A few routes the app calls from outside its API client (posting a
    // request, creating a direct deal) are not in the map at all.
    if (key in COVERAGE && COVERAGE[key]!.by !== 'assistant') unmarked.push(`${key} (${intent})`);
  }
  assert.deepEqual(unmarked, []);
});

test('the planned list only shrinks', () => {
  const planned = Object.values(COVERAGE).filter((c) => c.by === 'planned').length;
  assert.ok(planned <= PLANNED_CEILING, `${planned} planned actions, more than the ceiling of ${PLANNED_CEILING}: build them instead of adding to the list`);
});

test('every page-only and internal entry says why', () => {
  for (const [route, c] of Object.entries(COVERAGE)) {
    if (c.by === 'page' || c.by === 'internal') assert.ok(c.why.length > 10, `${route} needs a reason`);
  }
});
