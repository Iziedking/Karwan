'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError, type AdminAgentRuntimeRolloutResponse } from '@/core/api';
import {
  agentRuntimeTaskAttentionLabel,
  agentRuntimeTaskStateLabel,
  buildAgentRuntimeTaskRows,
  summarizeAgentRuntimeTasks,
} from '@/features/admin/agentRuntimePresentation';

const labelClass = 'mono text-[10px] uppercase tracking-[0.12em] text-white/40';

function when(ts: number): string {
  return new Date(ts).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  }) + ' UTC';
}

function attentionClass(attention: string): string {
  if (attention === 'dead_letter') return 'border-[#e0794f]/40 text-[#e0794f]';
  if (attention === 'retrying') return 'border-[#d9ad55]/40 text-[#d9ad55]';
  if (attention === 'active') return 'border-[#AFC95B]/40 text-[#AFC95B]';
  return 'border-white/20 text-white/50';
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
      <p className={labelClass}>[:AGENT RUNTIME:]</p>
      <h1 className="mt-2 font-sans text-[24px] font-extrabold">Operational runtime</h1>
      <p className="mt-2 text-[13px] text-white/55 max-w-[72ch]">
        Read-only visibility into durable retries, active work, and dead letters. This surface
        cannot replay tasks, call providers, move money, or change the legacy winner.
      </p>

      {error && (
        <div className="mt-5 border border-[#e0794f]/30 bg-[#e0794f]/10 rounded-lg px-3 py-2 text-[12px] text-[#e0794f]">
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
          <div key={label} className="border border-white/10 rounded-xl p-4 bg-[#161616]">
            <p className={labelClass}>{label}</p>
            <p className="mt-2 mono text-[22px] text-white">{value}</p>
          </div>
        ))}
      </section>

      {rollout && (
        <section className="mt-5 border border-white/10 rounded-xl p-5 bg-[#161616]">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className={labelClass}>Rollout gate · read-only</p>
              <p className="mt-1 text-[12px] text-white/55">
                {rollout.gate.eligible ? 'Eligible under the requested thresholds' : 'Blocked until evidence gates are satisfied'}
              </p>
            </div>
            <span className={`mono text-[10px] uppercase tracking-[0.1em] px-2 py-1 rounded border ${rollout.gate.eligible ? 'border-[#AFC95B]/40 text-[#AFC95B]' : 'border-[#e0794f]/40 text-[#e0794f]'}`}>
              {rollout.gate.eligible ? 'eligible' : 'blocked'}
            </span>
          </div>
          {rollout.gate.reasons.length > 0 && (
            <p className="mt-3 mono text-[10px] uppercase tracking-[0.08em] text-[#e0794f]">
              {rollout.gate.reasons.join(' · ')}
            </p>
          )}
          {rollout.missingMetrics.length > 0 && (
            <p className="mt-2 text-[11px] text-white/45">Missing metrics: {rollout.missingMetrics.join(', ')}</p>
          )}
        </section>
      )}

      <section className="mt-6 space-y-3">
        {loading && <p className="text-[13px] text-white/40">Loading durable runtime…</p>}
        {!loading && rows.length === 0 && (
          <div className="border border-white/10 rounded-xl p-5 bg-[#161616]">
            <p className="text-[14px] font-semibold">No recent durable tasks</p>
            <p className="mt-1 text-[12px] text-white/45">The bounded operational window is empty.</p>
          </div>
        )}
        {rows.map((task) => (
          <article key={task.id} className="border border-white/10 rounded-xl p-4 bg-[#161616]">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <p className={labelClass}>{task.kind} · attempt {task.attempt}/{task.maxAttempts}</p>
                <h2 className="mt-1 mono text-[12px] break-all text-white/85">{task.id}</h2>
                <p className="mt-1 text-[11px] text-white/35">Updated {when(task.updatedAt)}</p>
              </div>
              <span className={`mono text-[10px] uppercase tracking-[0.1em] px-2 py-1 rounded border ${attentionClass(task.attention)}`}>
                {agentRuntimeTaskAttentionLabel(task.attention)}
              </span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3 text-[11px] text-white/50">
              <p><span className="text-white/30">State:</span> {agentRuntimeTaskStateLabel(task.state)}</p>
              <p><span className="text-white/30">Available:</span> {when(task.availableAt)}</p>
              {task.dealRoomId && <p><span className="text-white/30">Deal room:</span> <span className="mono break-all">{task.dealRoomId}</span></p>}
            </div>
            {task.lastError && <p className="mt-3 text-[11px] text-[#e0794f]/80 break-words">{task.lastError}</p>}
          </article>
        ))}
      </section>
    </div>
  );
}
