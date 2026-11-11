/// Work that repeats, told apart from a one-time job (view 76). A request is
/// one price for one delivery; a tutor at a price a month, or a helper by the
/// hour, belongs on the monthly and hourly work tools instead. The check runs
/// on the server so every channel behaves the same.

export type RepeatingVerdict =
  | { verdict: 'one_time' }
  | { verdict: 'unsure' }
  | { verdict: 'repeating'; kind: 'hourly' | 'monthly' };

const HOURLY = /\b(?:per|an|each|every)\s+hour\b|\bhourly\b|\bby\s+the\s+hour\b|\bhours?\s+(?:a|per|each|every)\s+week\b/i;
// "within a month" and "in a week" are deadlines, not a way of paying.
const MONTHLY = /(?<!\b(?:within|in)\s)\b(?:per|a|each|every)\s+month\b|\bmonthly\b|\bretainer\b|\bby\s+the\s+month\b/i;
const RHYTHM = /\b(?:once|twice|\d+\s*(?:x|times)|(?:two|three|four|five|six|seven)\s+times)\s+(?:a|per|each|every)\s+(?:week|month)\b|\b(?:every|each)\s+(?:day|week|weekday|morning|evening|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\b(?:weekly|daily)\b/i;
const SOFT = /\b(?:lessons|classes|sessions|tutor|tutoring|tuition|coach|coaching|training\s+sessions)\b/i;

export function repeatingWork(brief: string): RepeatingVerdict {
  const text = brief.replace(/\s+/g, ' ');
  if (HOURLY.test(text)) return { verdict: 'repeating', kind: 'hourly' };
  if (MONTHLY.test(text) || RHYTHM.test(text)) return { verdict: 'repeating', kind: 'monthly' };
  if (SOFT.test(text)) return { verdict: 'unsure' };
  return { verdict: 'one_time' };
}

/// What the assistant is told instead of a request card.
export function repeatingDirection(v: Exclude<RepeatingVerdict, { verdict: 'one_time' }>, workOpen: boolean): string {
  const anyway = 'Only if they say they want one fixed price for one delivery, call propose_post_request again with confirmedOneTime true.';
  if (v.verdict === 'unsure') {
    return workOpen
      ? `Do not post this yet. Ask one question: is it one job at a fixed price, or paid by the month (or by the hour)? For paid by the month or the hour use propose_post_hourly_work, or propose_hourly_work when they named someone; for lessons or sessions ask how many a month and pass sessions. ${anyway}`
      : `Do not post this yet. Ask one question: is it one job at a fixed price? Work paid by the month or the hour is not open here yet, so say that plainly if that is what they want. ${anyway}`;
  }
  const how = v.kind === 'hourly' ? 'by the hour' : 'by the month';
  if (!workOpen) {
    return `This reads as work paid ${how}, which is not open here yet. Do not post it as it stands. Tell them plainly that only one-time jobs can be posted here for now, and ask whether to post it as one job at a fixed price. ${anyway}`;
  }
  return `This reads as work paid ${how}, not a one-time job, so do not post it as a request. Use propose_post_hourly_work with kind ${v.kind} when they have nobody in mind, or propose_hourly_work when they named someone.${v.kind === 'monthly' ? ' For lessons or sessions ask how many a month (three a week is 12) and pass sessions; each one is then recorded and the month is paid for the sessions that happened.' : ''} Ask for anything missing. ${anyway}`;
}
