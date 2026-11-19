import assert from 'node:assert/strict';
import test from 'node:test';
import { guideCopy, QUESTION_KEYS } from './guide';

function strings(value: unknown, at = ''): Array<[string, string]> {
  if (typeof value === 'string') return [[at, value]];
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => strings(v, at ? `${at}.${k}` : k));
}

test('every language has every string, none empty', () => {
  const keys = strings(guideCopy.en).map(([k]) => k).sort();
  for (const [locale, copy] of Object.entries(guideCopy)) {
    const own = strings(copy);
    assert.deepEqual(own.map(([k]) => k).sort(), keys, locale);
    for (const [k, v] of own) assert.ok(v.trim().length > 0, `${locale} ${k}`);
  }
});

test('no dashes in the copy', () => {
  for (const [locale, copy] of Object.entries(guideCopy)) {
    for (const [k, v] of strings(copy)) assert.ok(!/[—–]/.test(v), `${locale} ${k}`);
  }
});

test('the name is Aman in every language', () => {
  assert.equal(guideCopy.ar.label, 'أمان');
  assert.equal(guideCopy.hi.label, 'अमान');
  for (const locale of ['en', 'fr', 'sw'] as const) assert.equal(guideCopy[locale].label, 'Aman');
});

test('twelve questions, three for each page', () => {
  assert.equal(QUESTION_KEYS.length, 12);
  assert.deepEqual(Object.keys(guideCopy.en.questions).sort(), [...QUESTION_KEYS].sort());
});

test('the English copy reads as the spec says', () => {
  const en = guideCopy.en;
  assert.equal(en.notNow, 'Not now');
  assert.equal(en.menu.ask, 'Ask Aman');
  assert.equal(en.menu.askSub, 'Opens the assistant page');
  assert.equal(en.menu.quiet, 'Not on this page');
  assert.equal(en.menu.quietSub, 'Quiet here for this visit');
  assert.equal(en.menu.hide, 'Hide the guide');
  assert.equal(en.menu.hideSub, 'A small face in the top bar');
  assert.equal(en.greeting, 'Hi {name}. What do you want to do?');
  assert.equal(en.from, 'From {page}');
  assert.equal(en.box, 'Ask or tell Aman anything');
  assert.equal(en.person, 'Talk to a person');
  assert.equal(en.open, 'Open Aman');
  assert.deepEqual(en.questions, {
    'deal.money': "What happens to my money if they don't deliver?",
    'deal.approvePart': 'How do I approve a part?',
    'deal.moveDate': 'Ask them to move the date',
    'market.safe': 'How do I know a seller is safe?',
    'market.post': 'Post what I need',
    'market.cost': 'What does Karwan cost?',
    'money.where': 'Where is my money?',
    'money.withdraw': 'How do I withdraw to my bank?',
    'money.agent': 'Why is some of it with my agent?',
    'home.first': 'What should I do first?',
    'home.findSeller': 'Find me a seller',
    'home.getPaid': 'How do I get paid?',
  });
});

test('Show me in every language, and no page tour or New here copy left (view 57, 17 and 19 Nov)', () => {
  assert.equal(guideCopy.en.showMe, 'Show me');
  for (const [locale, copy] of Object.entries(guideCopy)) {
    assert.ok(copy.showMe.trim().length > 0, locale);
    assert.ok(!('tour' in copy), `${locale} still has tour copy`);
    assert.ok(!('newHere' in copy), `${locale} still has New here copy`);
  }
});

test('Aman guides you reads as drawn (view 57, 19 Nov)', () => {
  assert.deepEqual(guideCopy.en.guides, {
    hello: "Hi, I'm Aman. I'll show you around Karwan a little at a time, as you use it. Ask me anything. If I get in your way, you can switch me off.",
    askMe: 'Ask me something',
    switchOff: 'Switch me off',
    switchedOff: "Done. I'll stay up here. Tap me any time you need me.",
    checkIn: "You know your way around Karwan now, so I'll come by less. Anything I can help with?",
    askAman: 'Ask Aman',
    helpRow: 'Aman’s help on pages',
    helpOffNote: 'Off. Aman stays in the header. Tap it to ask anything.',
  });
});

test('placeholders survive translation', () => {
  for (const [locale, copy] of Object.entries(guideCopy)) {
    assert.ok(copy.greeting.includes('{name}'), `${locale} greeting`);
    assert.ok(copy.from.includes('{page}'), `${locale} from`);
  }
});
