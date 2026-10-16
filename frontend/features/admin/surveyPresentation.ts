import { CHECKS, PAYER, ROLES, SHARE, SIGNALS, type Check, type Payer, type Role, type Share, type Signal } from '@/features/research/researchForm';
import { researchCopy } from '@/shared/i18n/messages/research';

/// One answer to the /research survey, as GET /api/admin/research returns it
/// (backend/src/db/researchAnswers.ts).
export interface SurveyAnswer {
  id: string;
  createdAt: number;
  locale: string;
  role: Role;
  checks: Check[];
  otherText: string | null;
  trustMost: Signal;
  easiestFake: Signal;
  share: Share;
  payer: Payer;
  contact: string | null;
}

export interface SurveySummary {
  total: number;
  withContact: number;
  role: Record<Role, number>;
  checks: Record<Check, number>;
  trustMost: Record<Signal, number>;
  easiestFake: Record<Signal, number>;
  share: Record<Share, number>;
  payer: Record<Payer, number>;
}

export interface SurveySection {
  question: string;
  /// Several options could be ticked, so the counts add up to more than the total.
  multi: boolean;
  rows: Array<{ key: string; label: string; count: number; percent: number }>;
}

/// The survey's own English wording, so the admin reads what people saw.
const copy = researchCopy.en;

function section<K extends string>(question: string, keys: readonly K[], labels: Record<K, string>, counts: Record<K, number>, total: number, multi = false): SurveySection {
  return {
    question,
    multi,
    rows: keys.map((key) => {
      const count = counts[key] ?? 0;
      return { key, label: labels[key], count, percent: total > 0 ? Math.round((count / total) * 100) : 0 };
    }),
  };
}

export function surveySections(s: SurveySummary): SurveySection[] {
  return [
    section(copy.q1, ROLES, copy.roles, s.role, s.total),
    section(copy.q2, CHECKS, copy.checks, s.checks, s.total, true),
    section(copy.trustLabel, SIGNALS, copy.signals, s.trustMost, s.total),
    section(copy.fakeLabel, SIGNALS, copy.signals, s.easiestFake, s.total),
    section(copy.q4, SHARE, copy.share, s.share, s.total),
    section(copy.q5, PAYER, copy.payer, s.payer, s.total),
  ];
}

export function newestFirst(answers: readonly SurveyAnswer[]): SurveyAnswer[] {
  return [...answers].sort((a, b) => b.createdAt - a.createdAt);
}

export const roleLabel = (a: SurveyAnswer) => copy.roles[a.role] ?? a.role;
export const checksLabel = (a: SurveyAnswer) => a.checks.map((c) => copy.checks[c] ?? c).join('; ');
export const signalLabel = (s: Signal) => copy.signals[s] ?? s;
export const shareLabel = (a: SurveyAnswer) => copy.share[a.share] ?? a.share;
export const payerLabel = (a: SurveyAnswer) => copy.payer[a.payer] ?? a.payer;

/// A cell a spreadsheet opens as text: quoted when it holds a comma, quote or
/// line break, and a leading = + - @ disarmed so a typed answer never runs as
/// a formula.
function cell(value: string | null): string {
  let v = value ?? '';
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[",\n\r]/.test(v) || v !== (value ?? '') ? `"${v.replace(/"/g, '""')}"` : v;
}

export function surveyCsv(answers: readonly SurveyAnswer[]): string {
  const head = 'submitted_utc,language,role,checks,other,trust_most,easiest_fake,share,payer,contact';
  const rows = newestFirst(answers).map((a) =>
    [
      new Date(a.createdAt).toISOString(),
      a.locale,
      roleLabel(a),
      checksLabel(a),
      a.otherText,
      signalLabel(a.trustMost),
      signalLabel(a.easiestFake),
      shareLabel(a),
      payerLabel(a),
      a.contact,
    ]
      .map(cell)
      .join(','),
  );
  return [head, ...rows].join('\n');
}
