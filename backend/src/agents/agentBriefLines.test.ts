import assert from 'node:assert/strict';
import test from 'node:test';
import { briefLines, type BriefAnswers, type BriefRead } from './agentBriefLines.js';

/// "Here's your Karwan": the same sentences on the website, in Telegram and
/// from the assistant.
///
///   npx tsx --test src/agents/agentBriefLines.test.ts

const freelancer: BriefAnswers = { goals: ['work'], what: 'Logo and brand design', price: '20 to 40 USDC, 3 days', clients: 'find', own: 'offers', reach: 'telegram', where: 'Nigeria, Lagos' };
const read: BriefRead = { price: { min: 20, max: 40 }, pace: { minDays: 3, maxDays: 3 }, buyMax: null, business: null, place: { country: 'NG', city: 'Lagos' } };

test("a freelancer's summary, in order", () => {
  assert.deepEqual(briefLines(freelancer, read, 'en'), [
    'Your agent offers Logo and brand design',
    'Usually 30 USDC, lowest 20, delivers in about 3 days',
    'Your agent looks for matching requests on the market',
    'Your agent makes offers within your price, and asks before any deal',
    'We tell you on Telegram',
    'Looks for people near Lagos first',
    "Every client's payment is held until you deliver",
  ]);
});

test('an unread price says so, and the agent asks every time whatever was picked', () => {
  const lines = briefLines(freelancer, { ...read, price: null }, 'en');
  assert.equal(lines[1], 'Price not set yet. Your agent asks you each time.');
  assert.ok(lines.includes('Your agent suggests, and asks you every time'));
  assert.ok(!lines.includes('Your agent makes offers within your price, and asks before any deal'));
});

test('buying, business, record and own clients each add their line', () => {
  const lines = briefLines(
    { goals: ['buy', 'business', 'record'], buy: 'Phone repairs', places: 'Instagram, WhatsApp', clients: 'own', own: 'ask', reach: 'both' },
    { price: null, pace: null, buyMax: 50, business: { name: 'Bello Foods', trades: 'rice' }, place: null },
    'en',
  );
  assert.deepEqual(lines, [
    'Your buying agent looks for Phone repairs, up to 50 USDC',
    'Business profile ready to finish for Bello Foods',
    'Connect Instagram, WhatsApp to build your record',
    'Home puts payment requests for your clients first',
    'Your agent suggests, and asks you every time',
    'We tell you on Telegram, with email as backup',
    "Every client's payment is held until you deliver",
  ]);
});

test('every language gives the same number of lines with nothing left unfilled', () => {
  const en = briefLines(freelancer, read, 'en');
  for (const locale of ['fr', 'ar', 'hi', 'sw'] as const) {
    const lines = briefLines(freelancer, read, locale);
    assert.equal(lines.length, en.length, locale);
    for (const line of lines) assert.doesNotMatch(line, /[{}]|—/, `${locale}: ${line}`);
  }
});
