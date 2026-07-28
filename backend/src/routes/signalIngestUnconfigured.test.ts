import { test } from 'node:test';
import assert from 'node:assert/strict';

/// A deployment with no sweep configured must not have an open write endpoint.
///
/// Its own file because `config` reads the environment once when it loads, and
/// the test runner gives each file its own process. Re-importing the route
/// inside the main ingest test would re-use the cached config and quietly prove
/// nothing.
///
///   npx tsx --test src/routes/signalIngestUnconfigured.test.ts

assert.equal(
  process.env.SIGNAL_INGEST_TOKEN,
  undefined,
  'this file must run with no ingest token in the environment',
);

const { signalIngestRoutes } = await import('./signalIngest.js');

test('with no token configured, every request is refused', async () => {
  for (const authorization of ['Bearer anything', 'Bearer ', '']) {
    const res = await signalIngestRoutes.request('/ingest', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-real-ip': '10.1.0.1', authorization },
      body: JSON.stringify({
        signals: [{ origin: 'arc', source: 'Arc docs', title: 'anything' }],
      }),
    });
    assert.equal(res.status, 503, `authorization ${JSON.stringify(authorization)} got through`);
  }
});
