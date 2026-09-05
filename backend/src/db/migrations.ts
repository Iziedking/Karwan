export interface SqlQueryResult<TRow extends Record<string, unknown> = Record<string, unknown>> {
  rows: TRow[];
}

export interface SqlExecutor {
  query<TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<SqlQueryResult<TRow>>;
}

export interface NumberedMigration {
  version: number;
  name: string;
  sql: string;
}

const AGENT_RUNTIME_V2_SQL = `
CREATE TABLE deal_rooms (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL,
  mandate_version_id TEXT,
  active_offer_id TEXT,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  data JSONB NOT NULL
);
CREATE INDEX deal_rooms_state_updated_idx ON deal_rooms (state, updated_at);

CREATE TABLE mandate_versions (
  id TEXT PRIMARY KEY,
  deal_room_id TEXT NOT NULL REFERENCES deal_rooms(id),
  mandate_version BIGINT NOT NULL CHECK (mandate_version > 0),
  created_at BIGINT NOT NULL,
  data JSONB NOT NULL,
  UNIQUE (deal_room_id, mandate_version)
);
CREATE INDEX mandate_versions_room_created_idx ON mandate_versions (deal_room_id, created_at);

CREATE TABLE offers (
  id TEXT PRIMARY KEY,
  deal_room_id TEXT NOT NULL REFERENCES deal_rooms(id),
  offer_version BIGINT NOT NULL CHECK (offer_version > 0),
  state TEXT NOT NULL,
  proposer TEXT NOT NULL,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  expires_at BIGINT,
  data JSONB NOT NULL,
  UNIQUE (deal_room_id, offer_version)
);
CREATE INDEX offers_room_state_idx ON offers (deal_room_id, state);

CREATE TABLE negotiation_attempts (
  id TEXT PRIMARY KEY,
  deal_room_id TEXT NOT NULL REFERENCES deal_rooms(id),
  attempt_number BIGINT NOT NULL CHECK (attempt_number > 0),
  trigger TEXT NOT NULL,
  strategy TEXT NOT NULL,
  state TEXT NOT NULL,
  prior_offer_version BIGINT,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  available_at BIGINT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  data JSONB NOT NULL,
  UNIQUE (deal_room_id, attempt_number)
);
CREATE INDEX negotiation_attempts_room_state_idx ON negotiation_attempts (deal_room_id, state);
CREATE UNIQUE INDEX negotiation_attempts_one_active_idx
  ON negotiation_attempts (deal_room_id)
  WHERE state IN ('planned', 'running', 'waiting');

CREATE TABLE qualification_blockers (
  id TEXT PRIMARY KEY,
  deal_room_id TEXT NOT NULL REFERENCES deal_rooms(id),
  blocker_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  state TEXT NOT NULL,
  subject TEXT NOT NULL,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  resolved_at BIGINT,
  data JSONB NOT NULL
);
CREATE INDEX qualification_blockers_room_state_idx ON qualification_blockers (deal_room_id, state);

CREATE TABLE evidence_needs (
  id TEXT PRIMARY KEY,
  deal_room_id TEXT NOT NULL REFERENCES deal_rooms(id),
  need_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  state TEXT NOT NULL,
  risk_class TEXT NOT NULL,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  data JSONB NOT NULL
);
CREATE INDEX evidence_needs_room_state_idx ON evidence_needs (deal_room_id, state);

CREATE TABLE agent_tasks (
  id TEXT PRIMARY KEY,
  deal_room_id TEXT REFERENCES deal_rooms(id),
  kind TEXT NOT NULL,
  state TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  attempt BIGINT NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  available_at BIGINT NOT NULL,
  lease_owner TEXT,
  lease_expires_at BIGINT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  data JSONB NOT NULL
);
CREATE INDEX agent_tasks_claim_idx ON agent_tasks (state, available_at, created_at);
CREATE INDEX agent_tasks_room_idx ON agent_tasks (deal_room_id, created_at);

CREATE TABLE decisions (
  id TEXT PRIMARY KEY,
  deal_room_id TEXT NOT NULL REFERENCES deal_rooms(id),
  decision_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  outcome TEXT NOT NULL,
  mandate_version_id TEXT,
  offer_id TEXT,
  created_at BIGINT NOT NULL,
  data JSONB NOT NULL
);
CREATE INDEX decisions_room_created_idx ON decisions (deal_room_id, created_at);

CREATE TABLE policy_decisions (
  id TEXT PRIMARY KEY,
  deal_room_id TEXT REFERENCES deal_rooms(id),
  decision_key TEXT NOT NULL UNIQUE,
  policy_version TEXT NOT NULL,
  outcome TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  data JSONB NOT NULL
);
CREATE INDEX policy_decisions_room_created_idx ON policy_decisions (deal_room_id, created_at);

CREATE TABLE approvals (
  id TEXT PRIMARY KEY,
  deal_room_id TEXT NOT NULL REFERENCES deal_rooms(id),
  request_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  state TEXT NOT NULL,
  mandate_version_id TEXT,
  offer_id TEXT,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  expires_at BIGINT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  data JSONB NOT NULL
);
CREATE INDEX approvals_room_state_idx ON approvals (deal_room_id, state);

CREATE TABLE domain_events_v2 (
  id TEXT PRIMARY KEY,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  sequence BIGINT NOT NULL CHECK (sequence > 0),
  type TEXT NOT NULL,
  dedupe_key TEXT UNIQUE,
  occurred_at BIGINT NOT NULL,
  data JSONB NOT NULL,
  UNIQUE (aggregate_type, aggregate_id, sequence)
);
CREATE INDEX domain_events_v2_aggregate_idx
  ON domain_events_v2 (aggregate_type, aggregate_id, sequence);
CREATE INDEX domain_events_v2_occurred_idx ON domain_events_v2 (occurred_at);

CREATE TABLE event_outbox_v2 (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE REFERENCES domain_events_v2(id),
  state TEXT NOT NULL,
  attempt BIGINT NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  available_at BIGINT NOT NULL,
  lease_owner TEXT,
  lease_expires_at BIGINT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  published_at BIGINT,
  last_error TEXT
);
CREATE INDEX event_outbox_v2_claim_idx ON event_outbox_v2 (state, available_at, created_at);
`;

const DURABLE_EVENTS_AND_REPLAY_SQL = `
ALTER TABLE deal_rooms
  ADD COLUMN last_sequence BIGINT NOT NULL DEFAULT 0 CHECK (last_sequence >= 0);

ALTER TABLE domain_events_v2
  ADD COLUMN aggregate_version BIGINT NOT NULL DEFAULT 1 CHECK (aggregate_version > 0),
  ADD COLUMN category TEXT NOT NULL DEFAULT 'deal_room',
  ADD COLUMN actor TEXT NOT NULL DEFAULT 'platform',
  ADD COLUMN job_id TEXT,
  ADD COLUMN payload JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX domain_events_v2_job_sequence_idx
  ON domain_events_v2 (job_id, sequence);

CREATE TABLE event_consumptions_v2 (
  consumer TEXT NOT NULL,
  event_id TEXT NOT NULL REFERENCES domain_events_v2(id),
  processed_at BIGINT NOT NULL,
  data JSONB NOT NULL,
  PRIMARY KEY (consumer, event_id)
);
CREATE INDEX event_consumptions_v2_event_idx ON event_consumptions_v2 (event_id);

CREATE TABLE notification_jobs_v2 (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE REFERENCES domain_events_v2(id),
  state TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  data JSONB NOT NULL
);
CREATE INDEX notification_jobs_v2_state_created_idx
  ON notification_jobs_v2 (state, created_at);
`;

const DURABLE_TASK_RUNNER_SQL = `
ALTER TABLE agent_tasks
  ADD COLUMN max_attempts BIGINT NOT NULL DEFAULT 8 CHECK (max_attempts > 0),
  ADD COLUMN lease_token TEXT,
  ADD COLUMN heartbeat_at BIGINT,
  ADD COLUMN last_error TEXT,
  ADD COLUMN completed_at BIGINT,
  ADD COLUMN dead_lettered_at BIGINT;
CREATE INDEX agent_tasks_lease_expiry_idx
  ON agent_tasks (lease_expires_at)
  WHERE state IN ('leased', 'running');

CREATE TABLE agent_task_checkpoints (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES agent_tasks(id),
  checkpoint_key TEXT NOT NULL,
  sequence BIGINT NOT NULL CHECK (sequence > 0),
  phase TEXT NOT NULL,
  external_id TEXT,
  created_at BIGINT NOT NULL,
  data JSONB NOT NULL,
  UNIQUE (task_id, checkpoint_key),
  UNIQUE (task_id, sequence)
);
CREATE INDEX agent_task_checkpoints_task_sequence_idx
  ON agent_task_checkpoints (task_id, sequence);

CREATE TABLE agent_task_triggers (
  id TEXT PRIMARY KEY,
  trigger_key TEXT NOT NULL UNIQUE,
  task_id TEXT NOT NULL REFERENCES agent_tasks(id),
  deal_room_id TEXT REFERENCES deal_rooms(id),
  kind TEXT NOT NULL,
  source_event_id TEXT,
  created_at BIGINT NOT NULL,
  data JSONB NOT NULL
);
CREATE INDEX agent_task_triggers_room_created_idx
  ON agent_task_triggers (deal_room_id, created_at);

CREATE TABLE event_ingestion_cursors_v2 (
  source TEXT NOT NULL,
  partition_key TEXT NOT NULL,
  cursor TEXT NOT NULL,
  version BIGINT NOT NULL CHECK (version > 0),
  updated_at BIGINT NOT NULL,
  data JSONB NOT NULL,
  PRIMARY KEY (source, partition_key)
);

CREATE TABLE event_ingestion_dedupe_v2 (
  source TEXT NOT NULL,
  event_key TEXT NOT NULL,
  received_at BIGINT NOT NULL,
  data JSONB NOT NULL,
  PRIMARY KEY (source, event_key)
);
CREATE INDEX event_ingestion_dedupe_v2_received_idx
  ON event_ingestion_dedupe_v2 (received_at);
`;

const BUYER_TIMER_SHADOW_SQL = `
CREATE TABLE buyer_runtime_snapshots_v2 (
  job_id TEXT PRIMARY KEY,
  revision BIGINT NOT NULL CHECK (revision > 0),
  captured_at BIGINT NOT NULL,
  data JSONB NOT NULL
);
CREATE INDEX buyer_runtime_snapshots_v2_captured_idx
  ON buyer_runtime_snapshots_v2 (captured_at);
`;

const BUYER_TIMER_PARITY_AUDIT_SQL = `
CREATE TABLE buyer_timer_parity_audits_v2 (
  job_id TEXT NOT NULL,
  timer_kind TEXT NOT NULL CHECK (timer_kind IN ('collection', 'counter-timeout')),
  schedule_version BIGINT NOT NULL CHECK (schedule_version > 0),
  scheduled_for BIGINT NOT NULL CHECK (scheduled_for >= 0),
  scheduled_snapshot_revision BIGINT NOT NULL CHECK (scheduled_snapshot_revision > 0),
  created_at BIGINT NOT NULL,
  comparison_snapshot_revision BIGINT CHECK (comparison_snapshot_revision > 0),
  legacy_observed_at BIGINT,
  legacy_decision JSONB,
  planner_decision JSONB,
  task_observed_at BIGINT,
  task_decision JSONB,
  PRIMARY KEY (job_id, timer_kind, schedule_version),
  CHECK ((legacy_decision IS NULL) = (planner_decision IS NULL)),
  CHECK ((legacy_decision IS NULL) = (legacy_observed_at IS NULL)),
  CHECK ((legacy_decision IS NULL) = (comparison_snapshot_revision IS NULL)),
  CHECK ((task_decision IS NULL) = (task_observed_at IS NULL))
);
CREATE INDEX buyer_timer_parity_audits_created_idx
  ON buyer_timer_parity_audits_v2 (created_at DESC);
CREATE INDEX buyer_timer_parity_audits_kind_created_idx
  ON buyer_timer_parity_audits_v2 (timer_kind, created_at DESC);
`;

const MATCHING_ENGINE_AUDIT_SQL = `
CREATE TABLE matching_engine_audits_v2 (
  observation_key TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('buyer-bids', 'listing-brief')),
  mandate_id TEXT NOT NULL,
  mandate_version BIGINT NOT NULL CHECK (mandate_version > 0),
  legacy_winner_id TEXT,
  shadow_winner_id TEXT,
  comparison_status TEXT NOT NULL CHECK (comparison_status IN ('matched', 'diverged')),
  candidate_count BIGINT NOT NULL CHECK (candidate_count >= 0),
  observed_at BIGINT NOT NULL,
  data JSONB NOT NULL
);
CREATE INDEX matching_engine_audits_observed_idx
  ON matching_engine_audits_v2 (observed_at DESC);
CREATE INDEX matching_engine_audits_status_idx
  ON matching_engine_audits_v2 (comparison_status, observed_at DESC);
CREATE INDEX matching_engine_audits_mandate_idx
  ON matching_engine_audits_v2 (mandate_id, mandate_version, observed_at DESC);
`;

const MATCHING_AUDIT_REVIEW_SQL = `
CREATE TABLE matching_audit_reviews_v2 (
  review_id TEXT PRIMARY KEY,
  observation_key TEXT NOT NULL REFERENCES matching_engine_audits_v2(observation_key),
  decision TEXT NOT NULL CHECK (decision IN ('retain_legacy', 'accept_shadow', 'needs_more_evidence')),
  reviewer TEXT NOT NULL CHECK (length(trim(reviewer)) > 0),
  note TEXT CHECK (note IS NULL OR length(note) <= 500),
  created_at BIGINT NOT NULL CHECK (created_at >= 0),
  UNIQUE (observation_key)
);
CREATE INDEX matching_audit_reviews_created_idx
  ON matching_audit_reviews_v2 (created_at DESC);
`;

const NEGOTIATION_COMMANDS_SQL = `
CREATE UNIQUE INDEX negotiation_attempts_reentry_key_idx
  ON negotiation_attempts (deal_room_id, ((data ->> 'reentryKey')))
  WHERE data ? 'reentryKey';

CREATE TABLE negotiation_commands_v2 (
  command_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  result JSONB NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX negotiation_commands_created_idx
  ON negotiation_commands_v2 (created_at DESC);
`;

const EVIDENCE_AND_QUALIFICATION_RUNTIME_SQL = `
CREATE TABLE evidence_purchases_v2 (
  id TEXT PRIMARY KEY,
  evidence_need_id TEXT NOT NULL REFERENCES evidence_needs(id),
  idempotency_key TEXT NOT NULL UNIQUE,
  provider_id TEXT NOT NULL,
  state TEXT NOT NULL,
  price_usdc TEXT NOT NULL,
  provider_transaction_id TEXT,
  tx_hash TEXT,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  data JSONB NOT NULL
);
CREATE INDEX evidence_purchases_need_state_idx
  ON evidence_purchases_v2 (evidence_need_id, state, updated_at DESC);

CREATE TABLE evidence_snapshots_v2 (
  id TEXT PRIMARY KEY,
  evidence_need_id TEXT NOT NULL REFERENCES evidence_needs(id),
  purchase_id TEXT REFERENCES evidence_purchases_v2(id),
  source TEXT NOT NULL,
  captured_at BIGINT NOT NULL,
  reliability INTEGER NOT NULL CHECK (reliability >= 0 AND reliability <= 100),
  state TEXT NOT NULL,
  response_hash TEXT NOT NULL,
  provenance JSONB NOT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE (evidence_need_id, response_hash)
);
CREATE INDEX evidence_snapshots_need_captured_idx
  ON evidence_snapshots_v2 (evidence_need_id, captured_at DESC);

CREATE INDEX qualification_blockers_open_idx
  ON qualification_blockers (state, updated_at DESC)
  WHERE state = 'open';
`;

const FINANCIAL_COMMAND_RUNTIME_SQL = `
CREATE TABLE financial_commands_v2 (
  command_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  operation TEXT NOT NULL,
  amount_usdc TEXT NOT NULL,
  amount_micros TEXT NOT NULL,
  source_address TEXT NOT NULL,
  destination_address TEXT NOT NULL,
  expected_deal_room_version BIGINT NOT NULL CHECK (expected_deal_room_version > 0),
  expected_offer_version BIGINT,
  mandate_version BIGINT NOT NULL CHECK (mandate_version > 0),
  decision TEXT NOT NULL,
  reason TEXT NOT NULL,
  provider_lifecycle TEXT NOT NULL,
  provider_id TEXT,
  tx_hash TEXT,
  failure_code TEXT,
  approval_id TEXT,
  approval_version BIGINT,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  data JSONB NOT NULL
);
CREATE INDEX financial_commands_lifecycle_idx
  ON financial_commands_v2 (provider_lifecycle, updated_at DESC);
CREATE INDEX financial_commands_operation_idx
  ON financial_commands_v2 (operation, created_at DESC);
`;

const RESEARCH_CREDIT_RUNTIME_SQL = `
CREATE TABLE research_credit_accounts_v2 (
  owner TEXT PRIMARY KEY,
  balance_micros NUMERIC(78,0) NOT NULL CHECK (balance_micros >= 0),
  reserved_micros NUMERIC(78,0) NOT NULL CHECK (reserved_micros >= 0),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  data JSONB NOT NULL
);

CREATE TABLE research_credit_reservations_v2 (
  id TEXT PRIMARY KEY,
  reservation_key TEXT NOT NULL UNIQUE,
  owner TEXT NOT NULL REFERENCES research_credit_accounts_v2(owner),
  amount_micros NUMERIC(78,0) NOT NULL CHECK (amount_micros > 0),
  state TEXT NOT NULL CHECK (state IN ('reserved','settled','released')),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  data JSONB NOT NULL
);
CREATE INDEX research_credit_reservations_owner_state_idx
  ON research_credit_reservations_v2 (owner, state, updated_at DESC);
`;

const DURABLE_TASK_LEASE_AUDIT_SQL = `
ALTER TABLE agent_tasks
  ADD COLUMN lease_loss_count BIGINT NOT NULL DEFAULT 0 CHECK (lease_loss_count >= 0);
`;

const DURABLE_TASK_TRIGGER_AUDIT_SQL = `
ALTER TABLE agent_task_triggers
  ADD COLUMN duplicate_count BIGINT NOT NULL DEFAULT 0 CHECK (duplicate_count >= 0);
`;

const NEGOTIATION_COMMAND_CONFLICT_AUDIT_SQL = `
CREATE TABLE negotiation_command_conflicts_v2 (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL,
  attempted_command_id TEXT NOT NULL,
  attempted_kind TEXT NOT NULL,
  existing_command_id TEXT NOT NULL,
  existing_kind TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX negotiation_command_conflicts_created_idx
  ON negotiation_command_conflicts_v2 (created_at DESC);
CREATE INDEX negotiation_command_conflicts_key_idx
  ON negotiation_command_conflicts_v2 (idempotency_key, created_at DESC);
`;

const NEGOTIATION_MANDATES_SQL = `
CREATE TABLE negotiation_mandates_v2 (
  id TEXT PRIMARY KEY,
  deal_room_id TEXT NOT NULL REFERENCES deal_rooms(id),
  role TEXT NOT NULL CHECK (role IN ('BUYER', 'SELLER')),
  mandate_version BIGINT NOT NULL CHECK (mandate_version > 0),
  constraints_hash TEXT NOT NULL,
  constraints JSONB NOT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE (deal_room_id, role, mandate_version)
);
CREATE INDEX negotiation_mandates_room_idx
  ON negotiation_mandates_v2 (deal_room_id, role, mandate_version DESC);
`;

const MATCH_PROPOSAL_REVISIONS_SQL = `
CREATE TABLE match_proposal_revisions_v2 (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  revision BIGINT NOT NULL CHECK (revision > 0),
  proposal_fingerprint TEXT NOT NULL,
  observed_at BIGINT NOT NULL CHECK (observed_at >= 0),
  data JSONB NOT NULL,
  UNIQUE (job_id, revision),
  UNIQUE (job_id, proposal_fingerprint)
);
CREATE INDEX match_proposal_revisions_job_revision_idx
  ON match_proposal_revisions_v2 (job_id, revision DESC);
CREATE INDEX match_proposal_revisions_observed_idx
  ON match_proposal_revisions_v2 (observed_at DESC);
`;

const DURABLE_TASK_REPLAY_SQL = `
CREATE TABLE agent_task_replays_v2 (
  replay_key TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES agent_tasks(id),
  actor TEXT NOT NULL,
  created_at BIGINT NOT NULL CHECK (created_at >= 0)
);
CREATE INDEX agent_task_replays_task_created_idx
  ON agent_task_replays_v2 (task_id, created_at DESC);
`;

const AGENTKIT_RESEARCH_ALLOWANCE_SQL = `
CREATE TABLE agentkit_research_allowances_v1 (
  human_key_digest TEXT NOT NULL,
  scope TEXT NOT NULL,
  period_start BIGINT NOT NULL,
  allowance INTEGER NOT NULL CHECK (allowance > 0 AND allowance <= 100),
  used INTEGER NOT NULL CHECK (used >= 0 AND used <= allowance),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (human_key_digest, scope, period_start)
);
CREATE INDEX agentkit_research_allowances_period_idx
  ON agentkit_research_allowances_v1 (period_start, updated_at DESC);

CREATE TABLE agentkit_used_nonces_v1 (
  signer TEXT NOT NULL,
  domain TEXT NOT NULL,
  nonce TEXT NOT NULL,
  human_key_digest TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  consumed_at BIGINT NOT NULL,
  PRIMARY KEY (signer, domain, nonce)
);
CREATE INDEX agentkit_used_nonces_expiry_idx
  ON agentkit_used_nonces_v1 (expires_at);

CREATE TABLE agentkit_bindings_v1 (
  agent_address TEXT PRIMARY KEY,
  human_key_digest TEXT NOT NULL,
  verifier TEXT NOT NULL CHECK (verifier = 'world-agentbook'),
  checked_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at BIGINT NOT NULL
);
CREATE INDEX agentkit_bindings_human_idx
  ON agentkit_bindings_v1 (human_key_digest, expires_at DESC);
`;

const DEAL_INVITES_SQL = `
CREATE TABLE deal_invites_v1 (
  token TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  email TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  used_at BIGINT,
  data JSONB NOT NULL
);
CREATE UNIQUE INDEX deal_invites_one_pending_per_job_idx
  ON deal_invites_v1 (job_id) WHERE used_at IS NULL;
CREATE INDEX deal_invites_expiry_idx
  ON deal_invites_v1 (expires_at);
`;

export const NUMBERED_MIGRATIONS: readonly NumberedMigration[] = [
  {
    version: 1,
    name: 'agent_runtime_v2_foundations',
    sql: AGENT_RUNTIME_V2_SQL,
  },
  {
    version: 2,
    name: 'durable_events_and_replay',
    sql: DURABLE_EVENTS_AND_REPLAY_SQL,
  },
  {
    version: 3,
    name: 'durable_task_runner',
    sql: DURABLE_TASK_RUNNER_SQL,
  },
  {
    version: 4,
    name: 'buyer_timer_shadow',
    sql: BUYER_TIMER_SHADOW_SQL,
  },
  {
    version: 5,
    name: 'buyer_timer_parity_audit',
    sql: BUYER_TIMER_PARITY_AUDIT_SQL,
  },
  {
    version: 6,
    name: 'matching_engine_audit',
    sql: MATCHING_ENGINE_AUDIT_SQL,
  },
  {
    version: 7,
    name: 'negotiation_command_idempotency',
    sql: NEGOTIATION_COMMANDS_SQL,
  },
  {
    version: 8,
    name: 'evidence_and_qualification_runtime',
    sql: EVIDENCE_AND_QUALIFICATION_RUNTIME_SQL,
  },
  {
    version: 9,
    name: 'financial_command_runtime',
    sql: FINANCIAL_COMMAND_RUNTIME_SQL,
  },
  {
    version: 10,
    name: 'research_credit_runtime',
    sql: RESEARCH_CREDIT_RUNTIME_SQL,
  },
  {
    version: 11,
    name: 'durable_task_lease_audit',
    sql: DURABLE_TASK_LEASE_AUDIT_SQL,
  },
  {
    version: 12,
    name: 'durable_task_trigger_audit',
    sql: DURABLE_TASK_TRIGGER_AUDIT_SQL,
  },
  {
    version: 13,
    name: 'negotiation_command_conflict_audit',
    sql: NEGOTIATION_COMMAND_CONFLICT_AUDIT_SQL,
  },
  {
    version: 14,
    name: 'negotiation_mandate_snapshots',
    sql: NEGOTIATION_MANDATES_SQL,
  },
  {
    version: 15,
    name: 'matching_audit_reviews',
    sql: MATCHING_AUDIT_REVIEW_SQL,
  },
  {
    version: 16,
    name: 'match_proposal_revision_audit',
    sql: MATCH_PROPOSAL_REVISIONS_SQL,
  },
  {
    version: 17,
    name: 'durable_task_replay_audit',
    sql: DURABLE_TASK_REPLAY_SQL,
  },
  {
    version: 18,
    name: 'agentkit_research_allowance',
    sql: AGENTKIT_RESEARCH_ALLOWANCE_SQL,
  },
  {
    version: 19,
    name: 'durable_deal_invites',
    sql: DEAL_INVITES_SQL,
  },
] as const;

const MIGRATION_LOCK_KEY = 1_264_279_186;

function validateMigrations(migrations: readonly NumberedMigration[]): void {
  let prior = 0;
  const names = new Set<string>();
  for (const migration of migrations) {
    if (!Number.isSafeInteger(migration.version) || migration.version <= prior) {
      throw new Error('migrations must have unique, strictly increasing positive versions');
    }
    if (!migration.name.trim() || names.has(migration.name)) {
      throw new Error('migrations must have unique non-empty names');
    }
    if (!migration.sql.trim()) throw new Error(`migration ${migration.version} has no SQL`);
    prior = migration.version;
    names.add(migration.name);
  }
}

export async function runNumberedMigrations(
  executor: SqlExecutor,
  migrations: readonly NumberedMigration[] = NUMBERED_MIGRATIONS,
): Promise<number[]> {
  validateMigrations(migrations);
  await executor.query(`
    CREATE TABLE IF NOT EXISTS karwan_schema_migrations (
      version BIGINT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at BIGINT NOT NULL
    )
  `);
  await executor.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
  const appliedNow: number[] = [];
  try {
    for (const migration of migrations) {
      const result = await executor.query<{ name: string }>(
        'SELECT name FROM karwan_schema_migrations WHERE version = $1',
        [migration.version],
      );
      const existing = result.rows[0];
      if (existing) {
        if (existing.name !== migration.name) {
          throw new Error(
            `migration ${migration.version} was applied as ${existing.name}, expected ${migration.name}`,
          );
        }
        continue;
      }

      await executor.query('BEGIN');
      try {
        await executor.query(migration.sql);
        await executor.query(
          'INSERT INTO karwan_schema_migrations (version, name, applied_at) VALUES ($1, $2, $3)',
          [migration.version, migration.name, Date.now()],
        );
        await executor.query('COMMIT');
        appliedNow.push(migration.version);
      } catch (error) {
        await executor.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await executor.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
  }
  return appliedNow;
}
