import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import {
  buildMatchingAuditReviewQueue,
  PostgresMatchingAuditStore,
  type MatchingAuditObservation,
} from './audit.js';
import type { MatchingEvaluation } from './types.js';
import { PostgresMatchingAuditReviewStore } from './review.js';
import { buildMatchingReviewCoverage } from './reviewCoverage.js';
import { runNumberedMigrations } from '../db/migrations.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

const uncertainEvaluation: MatchingEvaluation = {
  engineVersion: 'matching-v2.0.0',
  scoringVersion: 'matching-score-v2.0.0',
  candidateId: 'uncertain-candidate',
  candidateVersion: 1,
  mandateVersion: 1,
  decision: 'ambiguous',
  matchLabel: 'EVIDENCE_PENDING',
  eligible: false,
  score: 0,
  skillCoverage: 0,
  reasons: ['EVIDENCE_UNCERTAIN'],
  filters: { passed: false, reasons: ['EVIDENCE_UNCERTAIN'], nearMiss: false },
  evidence: {
    declaredSkillIds: [],
    verifiedSkillIds: [],
    expiredSkillIds: [],
    revokedSkillIds: [],
    reliabilityScore: 0,
    reliableTransactionCount: 0,
    uncertainTransactionCount: 2,
    evidenceIds: ['paid-passport:uncertain'],
  },
  breakdown: {
    skillCoverage: 0,
    priceValue: 0,
    reliability: 0,
    reputation: 0,
    deadlineCapacity: 0,
    relationship: 0,
  },
  deterministicSeed: 'uncertain-seed',
};

test(
  'Postgres matching audit and review stores remain idempotent under a bounded concurrent soak',
  { skip: !testDatabaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 9 });
    const schema = `karwan_matching_soak_${randomUUID().replaceAll('-', '')}`;
    assert.match(schema, /^karwan_matching_soak_[a-f0-9]{32}$/);
    const setup = await pool.connect();
    const workers: pg.PoolClient[] = [];
    try {
      await setup.query(`CREATE SCHEMA "${schema}"`);
      await setup.query(`SET search_path TO "${schema}"`);
      await runNumberedMigrations(setup);

      for (let index = 0; index < 8; index += 1) {
        const worker = await pool.connect();
        await worker.query(`SET search_path TO "${schema}"`);
        workers.push(worker);
      }
      const auditStores = workers.map((worker) => new PostgresMatchingAuditStore(worker));
      const reviewStores = workers.map((worker) => new PostgresMatchingAuditReviewStore(worker));
      const observations: MatchingAuditObservation[] = Array.from({ length: 40 }, (_, index) => ({
        observationKey: `soak-observation-${index}`,
        source: index % 2 === 0 ? 'buyer-bids' : 'listing-brief',
        mandateId: `soak-mandate-${index}`,
        mandateVersion: 1,
        legacyCandidateIds: [`legacy-${index}`],
        shadowCandidateIds: index % 2 === 0 ? [`legacy-${index}`] : [`shadow-${index}`],
        evaluations: index === 0 ? [uncertainEvaluation] : [],
        telemetry: {
          legacyLatencyMs: index + 1,
          shadowLatencyMs: index + 0.5,
          legacyPaidCallCount: index % 3,
          shadowPaidCallCount: 0,
        },
        observedAt: 1_000 + index,
      }));

      for (let start = 0; start < observations.length; start += 4) {
        const batch = observations.slice(start, start + 4);
        await Promise.all(batch.flatMap((observation, offset) => {
          const first = auditStores[offset * 2]!;
          const second = auditStores[offset * 2 + 1]!;
          return [first.record(observation), second.record(observation)];
        }));
      }

      const audit = auditStores[0]!;
      const summary = await audit.summary();
      assert.equal(summary.total, observations.length);
      assert.equal(summary.comparison.matched, 20);
      assert.equal(summary.comparison.diverged, 20);
      assert.equal(summary.uncertainEvidenceUses, 2);
      assert.equal(summary.telemetry?.latency.samples, observations.length);
      assert.equal(summary.telemetry?.latency.legacySamples, observations.length);
      assert.equal(summary.telemetry?.latency.shadowSamples, observations.length);
      assert.equal(summary.telemetry?.latency.legacyTotalMs, 820);
      assert.equal(summary.telemetry?.latency.shadowTotalMs, 800);
      assert.equal(summary.telemetry?.paidCalls.samples, observations.length);
      assert.equal(summary.telemetry?.paidCalls.pairedSamples, observations.length);
      assert.equal(summary.telemetry?.paidCalls.legacyTotal, 39);
      assert.equal(summary.telemetry?.paidCalls.shadowTotal, 0);
      assert.equal(summary.telemetry?.paidCalls.delta, -39);
      const queue = buildMatchingAuditReviewQueue(await audit.list({ limit: 500 }), 500);
      assert.equal(queue.length, 20);

      for (let start = 0; start < queue.length; start += 4) {
        const batch = queue.slice(start, start + 4);
        await Promise.all(batch.flatMap((item, offset) => {
          const index = start + offset;
          const review = {
            reviewId: `soak-review-${index}`,
            observationKey: item.observationKey,
            decision: index % 2 === 0 ? 'retain_legacy' as const : 'needs_more_evidence' as const,
            reviewer: 'soak-operator',
            createdAt: 2_000 + index,
          };
          const first = reviewStores[offset * 2]!;
          const second = reviewStores[offset * 2 + 1]!;
          return [first.record(review), second.record(review)];
        }));
      }

      const reviews = await reviewStores[0]!.list({ limit: 500 });
      const coverage = buildMatchingReviewCoverage({ queue, reviews, scanComplete: true });
      assert.deepEqual(coverage, {
        queueCount: 20,
        reviewedCount: 20,
        pendingCount: 0,
        needsMoreEvidenceCount: 10,
        byDecision: { retain_legacy: 10, accept_shadow: 0, needs_more_evidence: 10 },
        scanComplete: true,
      });
    } finally {
      for (const worker of workers) worker.release();
      await setup.query('RESET search_path');
      if (!/^karwan_matching_soak_[a-f0-9]{32}$/.test(schema)) {
        throw new Error(`refusing to drop unexpected schema ${schema}`);
      }
      await setup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      setup.release();
      await pool.end();
    }
  },
);
