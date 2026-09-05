import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NUMBERED_MIGRATIONS,
  runNumberedMigrations,
  type SqlExecutor,
  type SqlQueryResult,
} from './migrations.js';

class RecordingExecutor implements SqlExecutor {
  readonly calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  readonly applied = new Map<number, string>();

  async query<TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<SqlQueryResult<TRow>> {
    this.calls.push({ sql, params });
    if (sql.startsWith('SELECT name FROM karwan_schema_migrations')) {
      const version = Number(params[0]);
      const name = this.applied.get(version);
      return { rows: name ? ([{ name }] as unknown as TRow[]) : [] };
    }
    if (sql.startsWith('INSERT INTO karwan_schema_migrations')) {
      this.applied.set(Number(params[0]), String(params[1]));
    }
    return { rows: [] };
  }
}

test('numbered migrations are ordered and contain every durable runtime table', () => {
  assert.deepEqual(NUMBERED_MIGRATIONS.map((migration) => migration.version), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  const sql = NUMBERED_MIGRATIONS[0]!.sql;
  for (const table of [
    'deal_rooms',
    'mandate_versions',
    'offers',
    'negotiation_attempts',
    'qualification_blockers',
    'evidence_needs',
    'agent_tasks',
    'decisions',
    'policy_decisions',
    'approvals',
    'domain_events_v2',
    'event_outbox_v2',
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE ${table}\\b`));
  }
  assert.match(sql, /UNIQUE \(deal_room_id, offer_version\)/);
  assert.match(sql, /idempotency_key TEXT NOT NULL UNIQUE/);
  assert.match(sql, /UNIQUE \(aggregate_type, aggregate_id, sequence\)/);
  const replaySql = NUMBERED_MIGRATIONS[1]!.sql;
  assert.match(replaySql, /ADD COLUMN last_sequence BIGINT/);
  assert.match(replaySql, /CREATE TABLE event_consumptions_v2/);
  assert.match(replaySql, /CREATE TABLE notification_jobs_v2/);
  const taskSql = NUMBERED_MIGRATIONS[2]!.sql;
  assert.match(taskSql, /ADD COLUMN max_attempts BIGINT/);
  assert.match(taskSql, /CREATE TABLE agent_task_checkpoints/);
  assert.match(taskSql, /CREATE TABLE agent_task_triggers/);
  assert.match(taskSql, /CREATE TABLE event_ingestion_cursors_v2/);
  assert.match(taskSql, /CREATE TABLE event_ingestion_dedupe_v2/);
  const buyerShadowSql = NUMBERED_MIGRATIONS[3]!.sql;
  assert.match(buyerShadowSql, /CREATE TABLE buyer_runtime_snapshots_v2/);
  assert.match(buyerShadowSql, /revision BIGINT NOT NULL CHECK \(revision > 0\)/);
  const paritySql = NUMBERED_MIGRATIONS[4]!.sql;
  assert.match(paritySql, /CREATE TABLE buyer_timer_parity_audits_v2/);
  assert.match(paritySql, /PRIMARY KEY \(job_id, timer_kind, schedule_version\)/);
  assert.match(paritySql, /legacy_decision JSONB/);
  assert.match(paritySql, /planner_decision JSONB/);
  assert.match(paritySql, /task_decision JSONB/);
  const matchingAuditSql = NUMBERED_MIGRATIONS[5]!.sql;
  assert.match(matchingAuditSql, /CREATE TABLE matching_engine_audits_v2/);
  assert.match(matchingAuditSql, /comparison_status TEXT NOT NULL/);
  const negotiationSql = NUMBERED_MIGRATIONS[6]!.sql;
  assert.match(negotiationSql, /negotiation_attempts_reentry_key_idx/);
  assert.match(negotiationSql, /CREATE TABLE negotiation_commands_v2/);
  assert.match(negotiationSql, /idempotency_key TEXT NOT NULL UNIQUE/);
  const evidenceSql = NUMBERED_MIGRATIONS[7]!.sql;
  assert.match(evidenceSql, /CREATE TABLE evidence_purchases_v2/);
  assert.match(evidenceSql, /CREATE TABLE evidence_snapshots_v2/);
  const financialSql = NUMBERED_MIGRATIONS[8]!.sql;
  assert.match(financialSql, /CREATE TABLE financial_commands_v2/);
  assert.match(financialSql, /idempotency_key TEXT NOT NULL UNIQUE/);
  assert.match(evidenceSql, /qualification_blockers_open_idx/);
  const creditSql = NUMBERED_MIGRATIONS[9]!.sql;
  assert.match(creditSql, /CREATE TABLE research_credit_accounts_v2/);
  assert.match(creditSql, /CREATE TABLE research_credit_reservations_v2/);
  const leaseAuditSql = NUMBERED_MIGRATIONS[10]!.sql;
  assert.match(leaseAuditSql, /ADD COLUMN lease_loss_count BIGINT/);
  const triggerAuditSql = NUMBERED_MIGRATIONS[11]!.sql;
  assert.match(triggerAuditSql, /ADD COLUMN duplicate_count BIGINT/);
  const commandConflictSql = NUMBERED_MIGRATIONS[12]!.sql;
  assert.match(commandConflictSql, /CREATE TABLE negotiation_command_conflicts_v2/);
  assert.match(commandConflictSql, /attempted_command_id TEXT NOT NULL/);
  const mandateSql = NUMBERED_MIGRATIONS[13]!.sql;
  assert.match(mandateSql, /CREATE TABLE negotiation_mandates_v2/);
  assert.match(mandateSql, /UNIQUE \(deal_room_id, role, mandate_version\)/);
  const matchingReviewSql = NUMBERED_MIGRATIONS[14]!.sql;
  assert.match(matchingReviewSql, /CREATE TABLE matching_audit_reviews_v2/);
  assert.match(matchingReviewSql, /UNIQUE \(observation_key\)/);
  assert.match(matchingReviewSql, /accept_shadow/);
  const proposalRevisionSql = NUMBERED_MIGRATIONS[15]!.sql;
  assert.match(proposalRevisionSql, /CREATE TABLE match_proposal_revisions_v2/);
  const durableReplaySql = NUMBERED_MIGRATIONS[16]!.sql;
  assert.match(durableReplaySql, /CREATE TABLE agent_task_replays_v2/);
  assert.match(proposalRevisionSql, /UNIQUE \(job_id, revision\)/);
  assert.match(proposalRevisionSql, /UNIQUE \(job_id, proposal_fingerprint\)/);
  const allowanceSql = NUMBERED_MIGRATIONS[17]!.sql;
  assert.match(allowanceSql, /CREATE TABLE agentkit_research_allowances_v1/);
  assert.match(allowanceSql, /CREATE TABLE agentkit_used_nonces_v1/);
  assert.match(allowanceSql, /CREATE TABLE agentkit_bindings_v1/);
  const inviteSql = NUMBERED_MIGRATIONS[18]!.sql;
  assert.match(inviteSql, /CREATE TABLE deal_invites_v1/);
  assert.match(inviteSql, /deal_invites_one_pending_per_job_idx/);
  assert.match(inviteSql, /WHERE used_at IS NULL/);
});

test('migration runner applies each migration once across repeated startup', async () => {
  const executor = new RecordingExecutor();
  assert.deepEqual(await runNumberedMigrations(executor), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  assert.deepEqual(await runNumberedMigrations(executor), []);
  assert.equal(executor.applied.get(1), 'agent_runtime_v2_foundations');
  assert.equal(executor.applied.get(2), 'durable_events_and_replay');
  assert.equal(executor.applied.get(3), 'durable_task_runner');
  assert.equal(executor.applied.get(4), 'buyer_timer_shadow');
  assert.equal(executor.applied.get(5), 'buyer_timer_parity_audit');
  assert.equal(executor.applied.get(6), 'matching_engine_audit');
  assert.equal(executor.applied.get(7), 'negotiation_command_idempotency');
  assert.equal(executor.applied.get(8), 'evidence_and_qualification_runtime');
  assert.equal(executor.applied.get(10), 'research_credit_runtime');
  assert.equal(
    executor.calls.filter((call) => call.sql === NUMBERED_MIGRATIONS[0]!.sql).length,
    1,
  );
  assert.equal(executor.applied.get(11), 'durable_task_lease_audit');
  assert.equal(executor.applied.get(12), 'durable_task_trigger_audit');
  assert.equal(executor.applied.get(13), 'negotiation_command_conflict_audit');
  assert.equal(executor.applied.get(14), 'negotiation_mandate_snapshots');
  assert.equal(executor.applied.get(15), 'matching_audit_reviews');
  assert.equal(executor.applied.get(16), 'match_proposal_revision_audit');
  assert.equal(executor.applied.get(17), 'durable_task_replay_audit');
  assert.equal(executor.applied.get(18), 'agentkit_research_allowance');
  assert.equal(executor.applied.get(19), 'durable_deal_invites');
  assert.equal(executor.calls.filter((call) => call.sql === 'BEGIN').length, 19);
  assert.equal(executor.calls.filter((call) => call.sql === 'COMMIT').length, 19);
});

test('migration runner rolls back a failed migration and always releases its lock', async () => {
  const executor = new RecordingExecutor();
  const original = executor.query.bind(executor);
  executor.query = async <TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<SqlQueryResult<TRow>> => {
    if (sql === NUMBERED_MIGRATIONS[0]!.sql) throw new Error('representative DDL failure');
    return original<TRow>(sql, params);
  };

  await assert.rejects(() => runNumberedMigrations(executor), /representative DDL failure/);
  assert.equal(executor.calls.some((call) => call.sql === 'ROLLBACK'), true);
  assert.equal(
    executor.calls.some((call) => call.sql === 'SELECT pg_advisory_unlock($1)'),
    true,
  );
});
