import assert from 'node:assert/strict';
import test from 'node:test';
import { filmState } from './signInMedia';

for (const film of [false, true]) {
  for (const reducedMotion of [false, true]) {
    for (const visible of [false, true]) {
      test(`film=${film}, reducedMotion=${reducedMotion}, visible=${visible}`, () => {
        const expected = !film ? 'art' : reducedMotion ? 'poster' : visible ? 'play' : 'pause';
        assert.equal(filmState({ film, reducedMotion, visible }), expected);
      });
    }
  }
}
