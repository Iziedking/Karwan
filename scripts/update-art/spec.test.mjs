import assert from 'node:assert/strict';
import test from 'node:test';
import { checkCards, sharpnessWarning } from './spec.mjs';

test('a good file passes with defaults filled in', () => {
  const { cards, errors } = checkCards({ cards: [{ name: 'arc-news', layout: 'logo', logo: 'arc.svg' }] });
  assert.deepEqual(errors, []);
  assert.equal(cards[0].ground, 'mist');
  assert.equal(cards[0].theme, 'light');
  assert.equal(cards[0].mirror, false);
});

test('each mistake is named with its card', () => {
  const { errors } = checkCards({
    cards: [
      { name: 'Arc News', layout: 'logo' },
      { name: 'x', layout: 'poster', ground: 'teal' },
      { name: 'x', layout: 'figure', figure: '12345678', unit: 'kilograms' },
      { name: 'shot', layout: 'screen' },
    ],
  });
  assert.ok(errors.some((e) => e.startsWith('card 1') && e.includes('hyphens')));
  assert.ok(errors.some((e) => e.startsWith('card 1') && e.includes('logo file')));
  assert.ok(errors.some((e) => e.startsWith('card 2') && e.includes('layout')));
  assert.ok(errors.some((e) => e.startsWith('card 2') && e.includes('ground')));
  assert.ok(errors.some((e) => e.startsWith('card 3') && e.includes('used twice')));
  assert.ok(errors.some((e) => e.startsWith('card 3') && e.includes('1 to 7')));
  assert.ok(errors.some((e) => e.startsWith('card 3') && e.includes('8 characters')));
  assert.ok(errors.some((e) => e.startsWith('card 4') && e.includes('screen file')));
});

test('an empty file says what it needs', () => {
  assert.deepEqual(checkCards({}).errors, ['the file needs a "cards" list with at least one card']);
});

test('a small bitmap is flagged and a vector never is', () => {
  const card = { name: 'arc-news' };
  assert.match(sharpnessWarning(card, 'logo', 200, 120, false), /soft/);
  assert.equal(sharpnessWarning(card, 'logo', 200, 120, true), null);
  assert.equal(sharpnessWarning(card, 'screen', 1170, 2532, false), null);
});
