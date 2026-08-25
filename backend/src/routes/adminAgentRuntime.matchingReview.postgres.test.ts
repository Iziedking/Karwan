import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { runNumberedMigrations } from '../db/migrations.js';
import { PostgresMatchingAuditStore } from '../matching/audit.js';
import { PostgresMatchingAuditReviewStore } from '../matching/review.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
process.env.ADMIN_API_TOKEN = 'matching-review-postgres-test-token';

const { createAdminAgentRuntimeRoutes } = await import('./adminAgentRuntime.js');

test(
  'Postgres matching review coverage is persisted and remains read-only to rollout authority',
  { skip: !testDatabaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 4 });
    const schema = `karwan_matching_review_${randomUUID().replaceAll('-', '')}`;
    assert.match(schema, /^karwan_matching_review_[a-f0-9]{32}$/);
    const client = await pool.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      await runNumberedMigrations(client);

      const matching = new PostgresMatchingAuditStore(client);
      const reviews = new PostgresMatchingAuditReviewStore(client);
      await matching.record({
        observationKey: 'postgres-review-observation',
        source: 'buyer-bids',
        mandateId: 'postgres-review-mandate',
        mandateVersion: 1,
        legacyCandidateIds: ['legacy-winner'],
        shadowCandidateIds: ['shadow-winner'],
        evaluations: [],
        observedAt: 100,
      });

      const routes = createAdminAgentRuntimeRoutes(
        () => null, () => matching, () => null, () => null, () => null, () => null,
        undefined, undefined, undefined, undefined, () => reviews,
      );
      const headers = { 'x-admin-token': 'matching-review-postgres-test-token' };
      const pendingResponse = await routes.request(
        '/rollout-gate?minimumObservations=1&maximumStaleOfferAcceptances=0', { headers },
      );
      assert.equal(pendingResponse.status, 200);
      const pendingBody = await pendingResponse.json() as {
        metrics: { matchingReviewsPending: number };
        matchingReviewCoverage: { reviewedCount: number; pendingCount: number };
        gate: { reasons: string[] };
      };
      assert.equal(pendingBody.metrics.matchingReviewsPending, 1);
      assert.deepEqual(pendingBody.matchingReviewCoverage, {
        queueCount: 1,
        reviewedCount: 0,
        pendingCount: 1,
        needsMoreEvidenceCount: 0,
        byDecision: { retain_legacy: 0, accept_shadow: 0, needs_more_evidence: 0 },
        scanComplete: true,
      });
      assert.ok(pendingBody.gate.reasons.includes('MATCHING_REVIEW_PENDING'));

      await reviews.record({
        reviewId: 'postgres-review-1',
        observationKey: 'postgres-review-observation',
        decision: 'retain_legacy',
        reviewer: 'admin',
        createdAt: 200,
      });
      const reviewedResponse = await routes.request(
        '/rollout-gate?minimumObservations=1&maximumStaleOfferAcceptances=0', { headers },
      );
      assert.equal(reviewedResponse.status, 200);
      const reviewedBody = await reviewedResponse.json() as {
        metrics: { matchingReviewsPending: number };
        matchingReviewCoverage: { reviewedCount: number; pendingCount: number; byDecision: { retain_legacy: number } };
      };
      assert.equal(reviewedBody.metrics.matchingReviewsPending, 0);
      assert.equal(reviewedBody.matchingReviewCoverage.reviewedCount, 1);
      assert.equal(reviewedBody.matchingReviewCoverage.pendingCount, 0);
      assert.equal(reviewedBody.matchingReviewCoverage.byDecision.retain_legacy, 1);
    } finally {
      await client.query('RESET search_path');
      if (!/^karwan_matching_review_[a-f0-9]{32}$/.test(schema)) {
        throw new Error(`refusing to drop unexpected schema ${schema}`);
      }
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      client.release();
      await pool.end();
    }
  },
);
