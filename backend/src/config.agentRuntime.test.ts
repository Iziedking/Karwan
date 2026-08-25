import assert from 'node:assert/strict';
import test from 'node:test';

const flagNames = [
  'MATCH_ENGINE_V2_SHADOW',
  'AGENT_RUNTIME_V2_ENABLED',
  'NEGOTIATION_V2_SHADOW',
  'EVIDENCE_V2_SHADOW',
  'STAKING_V2_ENABLED',
  'NEGOTIATION_V2_ENABLED',
  'FINANCIAL_COMMANDS_V2_ENABLED',
  'FINANCIAL_RECONCILIATION_V2_ENABLED',
  'REVIEWED_OPERATION_TASKS_V2_ENABLED',
  'EVIDENCE_RESEARCH_CREDIT_V2_ENABLED',
  'EVENT_OUTBOX_V2_ENABLED',
] as const;

test('reliable agent runtime flags default off', async () => {
  const prior = new Map(flagNames.map((name) => [name, process.env[name]]));
  for (const name of flagNames) delete process.env[name];
  try {
    const { config } = await import('./config.js');
    for (const name of flagNames) assert.equal(config[name], false, name);
  } finally {
    for (const name of flagNames) {
      const value = prior.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
