'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/core/api';
import { FormLimitsSwitch } from '@/features/admin/FormLimitsSwitch';
import {
  checksLabel,
  newestFirst,
  payerLabel,
  roleLabel,
  shareLabel,
  signalLabel,
  surveyCsv,
  surveySections,
  type SurveyAnswer,
} from '@/features/admin/surveyPresentation';

const labelClass = 'text-[10px] text-[var(--d-text-2)]';
type Data = Awaited<ReturnType<typeof api.adminResearch>>;

function when(ts: number): string {
  return new Date(ts).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  }) + ' UTC';
}

function downloadCsv(answers: SurveyAnswer[]) {
  const url = URL.createObjectURL(new Blob([surveyCsv(answers)], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `karwan-survey-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminSurveyPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.adminResearch());
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not load the survey answers');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const sections = useMemo(() => (data ? surveySections(data.summary) : []), [data]);
  const answers = useMemo(() => (data ? newestFirst(data.answers) : []), [data]);

  return (
    <div>
      <p className={labelClass}>Research</p>
      <h1 className="mt-2 font-sans text-[24px] font-semibold">Survey answers</h1>
      <p className="mt-2 max-w-[72ch] text-[13px] text-[var(--d-text-2)]">
        Answers to the public survey at /research on this network. Contact is optional and only for asking about the answers.
      </p>

      <FormLimitsSwitch />

      {error && (
        <div className="mt-5 rounded-lg border border-[#5A2A2E] bg-[#3A1C1F] px-3 py-2 text-[12px] text-[var(--d-red)]">
          {error} <button type="button" onClick={() => void load()} className="ml-2 underline">Retry</button>
        </div>
      )}

      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        {[
          ['Answers', data?.summary.total ?? '·'],
          ['Left a contact', data?.summary.withContact ?? '·'],
          ['Latest', answers[0] ? when(answers[0].createdAt) : '·'],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-[var(--d-line)] bg-[var(--d-surface)] p-4">
            <p className={labelClass}>{label}</p>
            <p className="mt-2 text-[22px] text-[var(--d-text)]">{value}</p>
          </div>
        ))}
      </section>

      <section className="mt-8 grid gap-3 lg:grid-cols-2">
        {sections.map((s) => (
          <div key={s.question} className="rounded-lg border border-[var(--d-line)] bg-[var(--d-surface)] p-5">
            <p className="text-[14px] font-semibold text-[var(--d-text)]">{s.question}</p>
            {s.multi && <p className="mt-1 text-[12px] text-[var(--d-text-2)]">Several could be picked, so counts add up to more than the total.</p>}
            <ul className="mt-3 space-y-2">
              {s.rows.map((r) => (
                <li key={r.key}>
                  <div className="flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="text-[var(--d-text)]">{r.label}</span>
                    <span className="shrink-0 text-[var(--d-text)]">{r.count} <span className="text-[var(--d-text-2)]">· {r.percent}%</span></span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-[var(--d-hover)]">
                    <div className="h-1.5 rounded-full bg-[var(--d-lime)]" style={{ width: `${Math.min(r.percent, 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <p className={labelClass}>Every answer, newest first</p>
          <button type="button" disabled={!answers.length} onClick={() => downloadCsv(answers)}
            className="min-h-11 text-[12px] text-[var(--d-text)] underline disabled:opacity-40">Download CSV</button>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-[13px]">
            <thead className="text-[var(--d-text-2)]">
              <tr>
                <th className="py-2 font-normal">Submitted</th>
                <th className="font-normal">Language</th>
                <th className="font-normal">Role</th>
                <th className="font-normal">Checks</th>
                <th className="font-normal">Trusts most</th>
                <th className="font-normal">Easiest to fake</th>
                <th className="font-normal">Share record</th>
                <th className="font-normal">Who pays</th>
                <th className="font-normal">Contact</th>
              </tr>
            </thead>
            <tbody>
              {answers.map((a) => (
                <tr key={a.id} className="border-t border-[var(--d-line)] align-top">
                  <td className="whitespace-nowrap py-2 pr-3 text-[var(--d-text-2)]">{when(a.createdAt)}</td>
                  <td className="pr-3 text-[var(--d-text-2)]">{a.locale}</td>
                  <td className="pr-3 text-[var(--d-text)]">{roleLabel(a)}</td>
                  <td className="pr-3 text-[var(--d-text)]">
                    {checksLabel(a)}
                    {a.otherText ? <span className="block text-[var(--d-text-2)]">“{a.otherText}”</span> : null}
                  </td>
                  <td className="pr-3 text-[var(--d-text)]">{signalLabel(a.trustMost)}</td>
                  <td className="pr-3 text-[var(--d-text)]">{signalLabel(a.easiestFake)}</td>
                  <td className="pr-3 text-[var(--d-text)]">{shareLabel(a)}</td>
                  <td className="pr-3 text-[var(--d-text)]">{payerLabel(a)}</td>
                  <td className="break-all text-[var(--d-text)]">{a.contact ?? <span className="text-[var(--d-text-3)]">None</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && answers.length === 0 && <p className="mt-3 text-[13px] text-[var(--d-text-2)]">No answers yet.</p>}
      </section>
    </div>
  );
}
