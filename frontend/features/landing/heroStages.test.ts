import assert from 'node:assert/strict';
import test from 'node:test';
import { heroStage, heroView } from './heroStages';

test('scrolling the pinned hero walks the five drawn states in order', () => {
  const stages = [0, 0.05, 0.1, 0.3, 0.45, 0.62, 0.85, 1].map(heroStage);
  assert.deepEqual(stages, [0, 0, 1, 2, 3, 4, 5, 5]);
});

test('the words change once: hero, then chat to terms, then both sides agree', () => {
  assert.equal(heroView(0).copy, 'hero');
  assert.equal(heroView(1).copy, 'terms');
  assert.equal(heroView(3).copy, 'terms');
  assert.equal(heroView(4).copy, 'agree');
  assert.equal(heroView(5).copy, 'agree');
});

test('the front of the phone swaps while its back faces you, so the swap is never seen', () => {
  assert.equal(heroView(0).screen, 'chat');
  assert.equal(heroView(1).screen, 'chat');
  assert.equal(heroView(2).screen, 'terms');
  assert.equal(heroView(3).screen, 'terms');
  assert.equal(heroView(4).screen, 'review');
});

test('the seller reviews first, then both have agreed and the buyer can pay', () => {
  assert.equal(heroView(3).sellerPhone, false);
  assert.deepEqual([heroView(4).sellerPhone, heroView(4).sellerAgreed], [true, false]);
  assert.deepEqual([heroView(5).sellerPhone, heroView(5).sellerAgreed], [true, true]);
});
