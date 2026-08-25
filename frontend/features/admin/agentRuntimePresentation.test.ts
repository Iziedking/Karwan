import assert from 'node:assert/strict';
import test from 'node:test';
import type { AdminAgentTask } from '../../core/api';
import {
  agentRuntimeTaskAttentionLabel,
  buildAgentRuntimeTaskRows,
  summarizeAgentRuntimeTasks,
} from './agentRuntimePresentation';

const fixture = (patch: Partial<AdminAgentTask>): AdminAgentTask => ({
  id: patch.id ?? 'task-1',
  kind: patch.kind ?? 'evidence.qualification.shadow',
  state: patch.state ?? 'pending',
  attempt: patch.attempt ?? 0,
  maxAttempts: patch.maxAttempts ?? 8,
  availableAt: patch.availableAt ?? 100,
  updatedAt: patch.updatedAt ?? 100,
  ...patch,
});

test('classifies and prioritizes dead letters before retries and active work', () => {
  const rows = buildAgentRuntimeTaskRows([
    fixture({ id: 'active', state: 'running', updatedAt: 300 }),
    fixture({ id: 'dead', state: 'dead_letter', updatedAt: 100 }),
    fixture({ id: 'retry', state: 'failed', attempt: 2, updatedAt: 200 }),
  ]);
  assert.deepEqual(rows.map((row) => [row.id, row.attention]), [
    ['dead', 'dead_letter'],
    ['retry', 'retrying'],
    ['active', 'active'],
  ]);
});

test('summarizes only the bounded task window without mutating input', () => {
  const tasks = [
    fixture({ id: 'one', state: 'succeeded' }),
    fixture({ id: 'two', state: 'waiting' }),
    fixture({ id: 'three', state: 'dead_letter' }),
  ];
  assert.deepEqual(summarizeAgentRuntimeTasks(tasks), {
    total: 3,
    retrying: 1,
    deadLettered: 1,
    active: 0,
    settled: 1,
  });
  assert.deepEqual(tasks.map((task) => task.id), ['one', 'two', 'three']);
});

test('labels preserve explicit read-only attention semantics', () => {
  assert.equal(agentRuntimeTaskAttentionLabel('dead_letter'), 'Dead letter');
  assert.equal(agentRuntimeTaskAttentionLabel('retrying'), 'Retrying');
});
