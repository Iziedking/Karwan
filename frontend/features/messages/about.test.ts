import assert from 'node:assert/strict';
import test from 'node:test';
import { aboutHref, parseAbout } from './about';

test('a listing or a request is read from the link, anything else is ignored', () => {
  assert.deepEqual(parseAbout('listing:lst_1'), { kind: 'listing', id: 'lst_1' });
  assert.deepEqual(parseAbout('request:0xabc123'), { kind: 'request', id: '0xabc123' });
  assert.equal(parseAbout('deal:1'), null);
  assert.equal(parseAbout('listing:../../etc'), null);
  assert.equal(parseAbout(undefined), null);
});

test('the About line links back to the ad', () => {
  assert.equal(aboutHref({ kind: 'listing', id: 'lst_1' }), '/listings/lst_1');
  assert.equal(aboutHref({ kind: 'request', id: 'job_9' }), '/jobs/job_9');
});
