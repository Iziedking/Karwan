import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanModelText } from './cleanText.js';

/// Model-internal markup never reaches a person (view 81).
///
///   npx tsx --test src/llm/cleanText.test.ts

test('a DeepSeek tool-call block is removed, closed or cut off', () => {
  assert.equal(
    cleanModelText("I'll check your USDC balance for you.\n\n<｜DSML｜function_calls"),
    "I'll check your USDC balance for you.",
  );
  assert.equal(
    cleanModelText('Done.<｜DSML｜function_calls><｜DSML｜invoke name="x">{}</｜DSML｜invoke></｜DSML｜function_calls> Anything else?'),
    'Done. Anything else?',
  );
});

test('a thinking block is removed, closed or cut off', () => {
  assert.equal(cleanModelText('<thinking> The user wants a balance. </thinking>\nYour balance is 50.00 USDC.'), 'Your balance is 50.00 USDC.');
  assert.equal(cleanModelText('Your balance is 50.00 USDC.\n<thinking> I should also'), 'Your balance is 50.00 USDC.');
  assert.equal(cleanModelText('<reasoning>x</reasoning>Hi'), 'Hi');
});

test('ordinary text is left exactly as it was', () => {
  const text = 'Price: 1,200 USDC <for 3 items>, delivery in 5 days.\n\nReply yes to agree.';
  assert.equal(cleanModelText(text), text);
  assert.equal(cleanModelText('{"verdict":"meets","reason":"ok"}'), '{"verdict":"meets","reason":"ok"}');
});

test('nothing but markup becomes empty, and blank runs collapse', () => {
  assert.equal(cleanModelText('<thinking>only this</thinking>'), '');
  assert.equal(cleanModelText('One.\n\n<thinking>x</thinking>\n\n\nTwo.'), 'One.\n\nTwo.');
});
