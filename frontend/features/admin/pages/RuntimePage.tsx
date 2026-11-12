'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError, type AdminAgentRuntimeRolloutResponse } from '@/core/api';
import {
  agentRuntimeTaskAttentionLabel,
  agentRuntimeTaskStateLabel,
  buildAgentRuntimeTaskRows,
  summarizeAgentRuntimeTasks,
} from '@/features/admin/agentRuntimePresentation';

const labelClass = 'text-[10px] text-[var(--d-text-2)]';

function when(ts: number): string {
  return new Date(ts).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  }) + ' UTC';
}

function attentionClass(attention: string): string {
  if (attention === 'dead_letter') return 'border-[#5A2A2E] text-[var(--d-red)]';
  if (attention === 'retrying') return 'border-[#5A4520] text-[var(--d-amber)]';
  if (attention === 'active') return 'border-[#3D4A22] text-[var(--d-lime)]';
  return 'border-[var(--d-line)] text-[var(--d-text-2)]';
}

export default function AdminRuntimePage() {
  const [tasks, setTasks] = useState<Awaited<ReturnType<typeof api.adminAgentRuntimeTasks>> | null>(null);
  const [rollout, setRollout] = useState<AdminAgentRuntimeRolloutResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [taskResponse, rolloutResponse] = await Promise.all([
        api.adminAgentRuntimeTasks({ limit: 100 }),
        api.adminAgentRuntimeRolloutGate(),
      ]);
      setTasks(taskResponse);
      setRollout(rolloutResponse);
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not load runtime operations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => buildAgentRuntimeTaskRows(tasks?.tasks ?? []), [tasks]);
  const counts = useMemo(() => summarizeAgentRuntimeTasks(tasks?.tasks ?? []), [tasks]);

  return (
    <div>
      <p className={labelClass}>Agent runtime</p>
      <h1 className="mt-2 font-sans text-[24px] font-semibold">Operational runtime</h1>
      <p className="mt-2 text-[13px] text-[var(--d-text-2)] max-w-[72ch]">
        Read-only visibility into durable retries, active work, and dead letters. This surface
        cannot replay tasks, call providers, move money, or change the legacy winner.
      </p>

      {error && (
        <div className="mt-5 border border-[#5A2A2E] bg-[#3A1C1F] rounded-lg px-3 py-2 text-[12px] text-[var(--d-red)]">
          {error} <button type="button" onClick={() => void load()} className="ml-2 underline">Retry</button>
        </div>
      )}

      <section className="mt-6 grid gap-3 sm:grid-cols-5">
        {[
          ['Window', counts.total],
          ['Retrying', counts.retrying],
          ['Dead letter', counts.deadLettered],
          ['Active', counts.active],
          ['Settled', counts.settled],
        ].map(([label, value]) => (
          <div key={label} className="border border-[var(--d-line)] rounded-lg p-4 bg-[var(--d-surface)]">
            <p className={labelClass}>{label}</p>
            <p className="mt-2 text-[22px] text-[var(--d-text)]">{value}</p>
          </div>
        ))}
      </section>

      {rollout && (
        <section className="mt-5 border border-[var(--d-line)] rounded-lg p-5 bg-[var(--d-surface)]">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className={labelClass}>Rollout gate · read-only</p>
              <p className="mt-1 text-[12px] text-[var(--d-text-2)]">
                {rollout.gate.eligible ? 'Eligible under the requested thresholds' : 'Blocked until evidence gates are satisfied'}
              </p>
            </div>
            <span className={` text-[10px] px-2 py-1 rounded border ${rollout.gate.eligible ? 'border-[#3D4A22] text-[var(--d-lime)]' : 'border-[#5A2A2E] text-[var(--d-red)]'}`}>
              {rollout.gate.eligible ? 'eligible' : 'blocked'}
            </span>
          </div>
          {rollout.gate.reasons.length > 0 && (
            <p className="mt-3 text-[10px] text-[var(--d-red)]">
              {rollout.gate.reasons.join(' · ')}
            </p>
          )}
          {rollout.missingMetrics.length > 0 && (
            <p className="mt-2 text-[11px] text-[var(--d-text-2)]">Missing metrics: {rollout.missingMetrics.join(', ')}</p>
          )}
        </section>
      )}

      <section className="mt-6 space-y-3">
        {loading && <p className="text-[13px] text-[var(--d-text-2)]">Loading durable runtime…</p>}
        {!loading && rows.length === 0 && (
          <div className="border border-[var(--d-line)] rounded-lg p-5 bg-[var(--d-surface)]">
            <p className="text-[14px] font-semibold">No recent durable tasks</p>
            <p className="mt-1 text-[12px] text-[var(--d-text-2)]">The bounded operational window is empty.</p>
          </div>
        )}
        {rows.map((task) => (
          <article key={task.id} className="border border-[var(--d-line)] rounded-lg p-4 bg-[var(--d-surface)]">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <p className={labelClass}>{task.kind} · attempt {task.attempt}/{task.maxAttempts}</p>
                <h2 className="mt-1 text-[12px] break-all text-[var(--d-text)]">{task.id}</h2>
                <p className="mt-1 text-[11px] text-[var(--d-text-3)]">Updated {when(task.updatedAt)}</p>
              </div>
              <span className={` text-[10px] px-2 py-1 rounded border ${attentionClass(task.attention)}`}>
                {agentRuntimeTaskAttentionLabel(task.attention)}
              </span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3 text-[11px] text-[var(--d-text-2)]">
              <p><span className="text-[var(--d-text-3)]">State:</span> {agentRuntimeTaskStateLabel(task.state)}</p>
              <p><span className="text-[var(--d-text-3)]">Available:</span> {when(task.availableAt)}</p>
              {task.dealRoomId && <p><span className="text-[var(--d-text-3)]">Deal room:</span> <span className="break-all">{task.dealRoomId}</span></p>}
            </div>
            {task.lastError && <p className="mt-3 text-[11px] text-[var(--d-red)] break-words">{task.lastError}</p>}
          </article>
        ))}
      </section>
    </div>
  );
}
