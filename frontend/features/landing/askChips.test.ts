import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { landingCopy } from '../../shared/i18n/messages/landing';

/// Each example on the landing asks for one thing the assistant has a tool
/// for, so tapping it lands on an answer, not on "a person is joining".
const TOOL_FOR_CHIP: Record<string, string> = {
  'Find a tailor in Aba': 'search_market',
  'Hold $400 until it arrives': 'start_protected_deal',
  'Check a seller before I pay': 'check_person',
  'Send a payment link': 'create_payment_link',
  'Hire a freelancer by the week': 'propose_post_hourly_work',
  'What’s my record?': 'get_my_reputation',
  'Get paid early': 'propose_get_paid_early',
  'Cash out': 'propose_cash_out',
  'Send $20 to a friend': 'propose_send_to_tag',
  'Find shea butter in Kano': 'search_market',
};

const assistantDir = new URL('../../../backend/src/assistant/', import.meta.url);
const assistantSource = readdirSync(assistantDir)
  .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
  .map((name) => readFileSync(new URL(name, assistantDir), 'utf8'))
  .join('\n');

test('every example question names a tool the assistant has', () => {
  assert.deepEqual(landingCopy.en.ask.chips, Object.keys(TOOL_FOR_CHIP));
  for (const [chip, tool] of Object.entries(TOOL_FOR_CHIP)) {
    assert.match(assistantSource, new RegExp(`\\b${tool}: tool\\(`), `${chip} → ${tool}`);
  }
});

test('every language asks the same ten things', () => {
  for (const copy of Object.values(landingCopy)) assert.equal(copy.ask.chips.length, landingCopy.en.ask.chips.length);
});
