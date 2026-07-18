'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type SupervisorDiagnosis } from '@/core/api';

/// Runtime errors captured by the backend error tracker, each with the Phase-C
/// supervisor's read-first diagnosis. Proactive mode fills diagnoses in the
/// background as errors land; the Diagnose button runs one on demand (not subject
/// to the proactive rate cap), so any error can be explained even with proactive
/// off. Read-only: the supervisor suggests, it does not act.

const CARD = 'bg-[#161616] border border-white/10 rounded-2xl p-5';
const LABEL = 'mono text-[10px] uppercase tracking-[0.18em] text-white/40';
const BTN =
  'shrink-0 mono text-[11px] uppercase tracking-[0.12em] font-bold px-4 py-2.5 rounded-lg bg-white text-[#0e0e0e] disabled:opacity-50 transition';
const BTN_GHOST =
  'shrink-0 mono text-[10px] uppercase tracking-[0.12em] font-bold px-3 py-2 rounded-lg border border-white/15 text-white/70 hover:text-white hover:border-white/40 disabled:opacity-40 transition';

const RED = '#e0794f';
const AMBER = '#e0b04f';
const GREEN = '#6BE39A';
const GREY = 'rgba(255,255,255,0.28)';

type ErrorsResp = Awaited<ReturnType<typeof api.adminErrors>>;
type ErrRow = ErrorsResp['errors'][number];

function errMsg(e: unknown): string {
  return e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Failed';
}

function fmtAge(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 90) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function severityColor(sev?: SupervisorDiagnosis['severity']): string {
  if (sev === 'critical') return RED;
  if (sev === 'warning') return AMBER;
  if (sev === 'info') return GREEN;
  return GREY;
}

function Dot({ color }: { color: string }) {
  return <span aria-hidden className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: color }} />;
}

export default function AdminErrors() {
  const [data, setData] = useState<ErrorsResp | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      setData(await api.adminErrors(100));
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  const s = data?.supervisor;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className={LABEL}>[:ERRORS:]</p>
          <h1 className="mt-2 font-sans text-[26px] font-extrabold text-white">Runtime errors</h1>
          <p className="mt-1 text-[13px] text-white/50 max-w-[68ch]">
            Backend errors captured as they happen, each with the supervisor&apos;s read-first
            diagnosis. Proactive mode fills these in the background. Diagnose runs one on demand.
          </p>
        </div>
        <button type="button" onClick={() => void run()} disabled={busy} className={BTN}>
          {busy ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {s && (
        <section>
          <p className={LABEL}>[:SUPERVISOR:]</p>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatTile label="Diagnosed" value={s.diagnosed} />
            <StatTile label="Deduped" value={s.deduped} />
            <StatTile label="Rate-limited" value={s.rateLimited} tone={s.rateLimited > 0 ? AMBER : undefined} />
            <StatTile label="Failed" value={s.failed} tone={s.failed > 0 ? RED : undefined} />
            <StatTile label="Skipped" value={s.skipped} />
            <StatTile label="Cached" value={s.cached} />
          </div>
          {s.diagnosed === 0 && s.cached === 0 && (
            <p className="mt-3 text-[12px] text-white/40">
              No proactive diagnoses yet. Proactive mode may be off
              (SUPERVISOR_PROACTIVE_ENABLED). You can still Diagnose any error on demand below.
            </p>
          )}
        </section>
      )}

      {err && <p className="text-[13px]" style={{ color: RED }}>{err}</p>}

      {data && data.errors.length === 0 && (
        <div className={CARD}>
          <p className="text-[13px] text-white/50">No errors captured. Clean run.</p>
        </div>
      )}

      <div className="space-y-3">
        {data?.errors.map((row, i) => (
          <ErrorCard key={`${row.scope}|${row.ts}`} row={row} index={i} />
        ))}
      </div>
    </div>
  );
}

function StatTile({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="bg-[#161616] border border-white/10 rounded-xl p-4">
      <p className={LABEL}>{label}</p>
      <p className="mt-2 font-sans text-[24px] font-extrabold tabular-nums" style={{ color: tone ?? '#fff' }}>
        {value}
      </p>
    </div>
  );
}

function ErrorCard({ row, index }: { row: ErrRow; index: number }) {
  const [diagnosis, setDiagnosis] = useState<SupervisorDiagnosis | null>(row.diagnosis);
  const [busy, setBusy] = useState(false);
  const [derr, setDerr] = useState<string | null>(null);
  const [showStack, setShowStack] = useState(false);

  async function diagnose() {
    setBusy(true);
    setDerr(null);
    try {
      const r = await api.adminDiagnose(index);
      setDiagnosis(r.diagnosis);
    } catch (e) {
      setDerr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const ctx = row.context && Object.keys(row.context).length > 0 ? row.context : null;

  return (
    <div className={CARD}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex items-start gap-2.5">
          <span className="mt-1.5">
            <Dot color={severityColor(diagnosis?.severity)} />
          </span>
          <div className="min-w-0">
            <p className="mono text-[12px] text-white/85 break-all">{row.scope}</p>
            <p className="mt-1 text-[13px] text-white/60 break-words">{row.message}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="mono text-[10px] uppercase tracking-[0.12em] text-white/35">{fmtAge(row.ts)}</span>
          {!diagnosis && (
            <button type="button" onClick={() => void diagnose()} disabled={busy} className={BTN_GHOST}>
              {busy ? 'Diagnosing…' : 'Diagnose'}
            </button>
          )}
        </div>
      </div>

      {ctx && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {Object.entries(ctx).map(([k, v]) => (
            <span key={k} className="mono text-[11px] text-white/45">
              {k}=<span className="text-white/70">{typeof v === 'string' ? v : JSON.stringify(v)}</span>
            </span>
          ))}
        </div>
      )}

      {row.stack && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowStack((v) => !v)}
            className="mono text-[10px] uppercase tracking-[0.12em] text-white/40 hover:text-white/70 transition"
          >
            {showStack ? 'Hide stack' : 'Show stack'}
          </button>
          {showStack && (
            <pre className="mt-2 overflow-x-auto rounded-lg bg-[#0e0e0e] border border-white/10 p-3 text-[11px] leading-relaxed text-white/55 whitespace-pre-wrap break-words">
              {row.stack}
            </pre>
          )}
        </div>
      )}

      {derr && <p className="mt-3 text-[12px]" style={{ color: RED }}>{derr}</p>}

      {diagnosis && <Diagnosis d={diagnosis} />}
    </div>
  );
}

function Diagnosis({ d }: { d: SupervisorDiagnosis }) {
  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-[#0e0e0e] p-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className="mono text-[10px] uppercase tracking-[0.12em] font-bold px-2 py-1 rounded"
          style={{ background: severityColor(d.severity), color: '#0e0e0e' }}
        >
          {d.severity}
        </span>
        <span className="mono text-[10px] uppercase tracking-[0.12em] text-white/40">
          confidence {d.confidence}
        </span>
        <span className="mono text-[10px] uppercase tracking-[0.12em] text-white/25 ml-auto">{d.model}</span>
      </div>
      <p className="mt-3 text-[13.5px] text-white/90 font-medium">{d.summary}</p>
      <Field label="Likely cause" value={d.likelyCause} />
      <Field label="Suggested fix" value={d.suggestedFix} />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-3">
      <p className={LABEL}>{label}</p>
      <p className="mt-1 text-[13px] text-white/70 leading-relaxed">{value}</p>
    </div>
  );
}
