import assert from 'node:assert/strict';
import test from 'node:test';
import { Hono } from 'hono';

import {
  createCorrelationMiddleware,
  type CorrelationLogger,
} from './correlationMiddleware.js';
import { CORRELATION_HEADER } from './correlation.js';

test('sets a response correlation header and logs a query-free completion record', async () => {
  const records: Array<{ metadata: Record<string, unknown>; message: string }> = [];
  const logger: CorrelationLogger = {
    debug(metadata, message) {
      records.push({ metadata, message });
    },
  };
  const app = new Hono();
  app.use('*', createCorrelationMiddleware(logger));
  app.get('/health', (c) => c.text('ok'));

  const response = await app.request(
    new Request('http://localhost/health?token=do-not-log', {
      headers: { 'X-Correlation-ID': 'support-42' },
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get(CORRELATION_HEADER), 'support-42');
  assert.equal(records.length, 1);
  assert.equal(records[0]?.message, 'request completed');
  assert.equal(records[0]?.metadata.correlationId, 'support-42');
  assert.equal(records[0]?.metadata.path, '/health');
  assert.equal(records[0]?.metadata.method, 'GET');
  assert.equal(records[0]?.metadata.status, 200);
  assert.ok(!JSON.stringify(records[0]).includes('do-not-log'));
});
