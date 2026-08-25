import type { AdminAgentTask, AdminAgentTaskState } from '../../core/api';

export type AgentRuntimeTaskAttention = 'dead_letter' | 'retrying' | 'active' | 'settled';

export interface AgentRuntimeTaskRow extends AdminAgentTask {
  attention: AgentRuntimeTaskAttention;
}

export interface AgentRuntimeTaskCounts {
  total: number;
  retrying: number;
  deadLettered: number;
  active: number;
  settled: number;
}

function attentionFor(task: Pick<AdminAgentTask, 'state' | 'attempt'>): AgentRuntimeTaskAttention {
  if (task.state === 'dead_letter') return 'dead_letter';
  if (task.state === 'failed' || task.state === 'waiting' || task.attempt > 0) return 'retrying';
  if (task.state === 'pending' || task.state === 'leased' || task.state === 'running') return 'active';
  return 'settled';
}

export function buildAgentRuntimeTaskRows(tasks: readonly AdminAgentTask[]): AgentRuntimeTaskRow[] {
  return [...tasks]
    .map((task) => ({ ...task, attention: attentionFor(task) }))
    .sort((a, b) => {
      const priority = (attention: AgentRuntimeTaskAttention): number =>
        attention === 'dead_letter' ? 0 : attention === 'retrying' ? 1 : attention === 'active' ? 2 : 3;
      return priority(a.attention) - priority(b.attention) || b.updatedAt - a.updatedAt || a.id.localeCompare(b.id);
    });
}

export function summarizeAgentRuntimeTasks(tasks: readonly AdminAgentTask[]): AgentRuntimeTaskCounts {
  const rows = buildAgentRuntimeTaskRows(tasks);
  return {
    total: rows.length,
    retrying: rows.filter((row) => row.attention === 'retrying').length,
    deadLettered: rows.filter((row) => row.attention === 'dead_letter').length,
    active: rows.filter((row) => row.attention === 'active').length,
    settled: rows.filter((row) => row.attention === 'settled').length,
  };
}

export function agentRuntimeTaskStateLabel(state: AdminAgentTaskState): string {
  return state.replace('_', ' ');
}

export function agentRuntimeTaskAttentionLabel(attention: AgentRuntimeTaskAttention): string {
  switch (attention) {
    case 'dead_letter': return 'Dead letter';
    case 'retrying': return 'Retrying';
    case 'active': return 'Active';
    case 'settled': return 'Settled';
  }
}
