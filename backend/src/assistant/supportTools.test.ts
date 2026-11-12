import assert from 'node:assert/strict';
import test from 'node:test';
import { HELP_TOOL_NAMES, supportTools, type SupportToolDeps } from './supportTools.js';

/// The assistant opens a case with a person from any channel (view 78).
///
///   npx tsx --test src/assistant/supportTools.test.ts

const ME = '0xabc';
const run = async (t: unknown, args: unknown) => (t as { execute: (a: unknown, o: unknown) => Promise<unknown> }).execute(args, {});

function deps(over: Partial<SupportToolDeps> = {}): SupportToolDeps {
  return {
    open: async () => ({ ok: true, ref: 'KT-1042', joined: false, dueAt: 1, line: 'Case KT-1042. Someone from Karwan replies within 2 hours.', outOfHours: null }),
    mine: async () => [{ ref: 'KT-1042', kind: 'transfer_missing', state: 'waiting_us', lastLine: 'Where is it?', updatedAt: Date.parse('2026-11-12T09:00:00Z') }],
    add: async () => true,
    ...over,
  };
}

test('open_support_case gives the in-hours line with the reference', async () => {
  let seen: { text: string; records: unknown[] } | null = null;
  const tools = supportTools(ME, deps({ open: async (_a, input) => { seen = input; return { ok: true, ref: 'KT-1042', joined: false, dueAt: 1, line: 'Case KT-1042. Someone from Karwan replies within 2 hours.', outOfHours: null }; } }));
  const out = (await run(tools.open_support_case, { summary: 'My payout never arrived', expected: 'Money in my bank', happened: 'Nothing came', records: [{ kind: 'transfer', id: 'KR-7Q2M' }] })) as { ref: string; line: string };
  assert.equal(out.ref, 'KT-1042');
  assert.match(out.line, /replies within 2 hours/);
  assert.equal(seen!.text, 'My payout never arrived\nExpected: Money in my bank\nWhat happened: Nothing came');
  assert.deepEqual(seen!.records, [{ kind: 'transfer', id: 'KR-7Q2M' }]);
});

test('out of hours it gives the back-at line', async () => {
  const tools = supportTools(ME, deps({ open: async () => ({ ok: true, ref: 'KT-1043', joined: false, dueAt: 1, line: 'Our team is back at 8am Lagos time. Your case is KT-1043.', outOfHours: 'Our team is back at 8am Lagos time. Your case is KT-1043.' }) }));
  const out = (await run(tools.open_support_case, { summary: 'Help' })) as { line: string };
  assert.equal(out.line, 'Our team is back at 8am Lagos time. Your case is KT-1043.');
});

test('a record that is not theirs is refused in words', async () => {
  const tools = supportTools(ME, deps({ open: async () => ({ ok: false, reason: 'not_yours' }) }));
  const out = (await run(tools.open_support_case, { summary: 'Look', records: [{ kind: 'deal', id: '0xdeal' }] })) as { opened: boolean; note: string };
  assert.equal(out.opened, false);
  assert.match(out.note, /not one of theirs/);
});

test('my_support_cases names each case by reference, kind and state in words', async () => {
  const out = (await run(supportTools(ME, deps()).my_support_cases, {})) as { cases: Array<Record<string, string>> };
  assert.deepEqual(out.cases[0], { ref: 'KT-1042', about: 'Transfer did not arrive', state: 'Waiting on us', last: 'Where is it?', updated: '2026-11-12' });
});

test('add_to_support_case refuses a case that is not theirs', async () => {
  const out = (await run(supportTools(ME, deps({ add: async () => false })).add_to_support_case, { ref: 'KT-9999', text: 'hi' })) as { added: boolean };
  assert.equal(out.added, false);
});

test('help mode has no tool that moves money or proposes a change', () => {
  for (const name of HELP_TOOL_NAMES) {
    assert.ok(!name.startsWith('propose_') || name === 'propose_navigation', name);
    assert.ok(!/pay|send|release|withdraw|cash_out|fund|set_|start_|order_|create_|cancel_|remember|forget/.test(name), name);
  }
  for (const name of ['open_support_case', 'my_support_cases', 'add_to_support_case', 'get_product_facts']) assert.ok(HELP_TOOL_NAMES.includes(name), name);
});

test('help mode keeps only the help tools, the assistant keeps all', async () => {
  const { toolsForMode } = await import('./supportTools.js');
  const all = { propose_send_to_tag: 1, get_my_balance: 2, open_support_case: 3, remember_this: 4 };
  assert.deepEqual(Object.keys(toolsForMode(all, 'help')).sort(), ['get_my_balance', 'open_support_case']);
  assert.deepEqual(Object.keys(toolsForMode(all, 'assistant')).sort(), Object.keys(all).sort());
  assert.deepEqual(Object.keys(toolsForMode(all, undefined)).sort(), Object.keys(all).sort());
});
