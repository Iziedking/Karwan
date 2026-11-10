const zoneName = (timeZone: string) => (timeZone.split('/').pop() ?? timeZone).replace(/_/g, ' ');

function parts(at: number, timeZone: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('en-GB', {
    timeZone, weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(at)) out[p.type] = p.value;
  return out;
}

const isoDay = (at: number, timeZone: string) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);

/// What the assistant is told about the present: the weekday, date and time
/// where the person is, and the dates of the next seven days by name, so
/// "by Friday" becomes a date without the model counting or the person being
/// asked to. Pure.
export function nowLine(at: number, timeZone: string): string {
  const now = parts(at, timeZone);
  const next = Array.from({ length: 7 }, (_, i) => {
    const day = at + (i + 1) * 86_400_000;
    return `${parts(day, timeZone).weekday} ${isoDay(day, timeZone)}`;
  });
  return [
    `It is ${now.weekday} ${Number(now.day)} ${now.month} ${now.year}, ${now.hour}:${now.minute} in ${zoneName(timeZone)} (${isoDay(at, timeZone)}; ${new Date(at).toISOString()} UTC).`,
    `The next seven days there: ${next.join(', ')}.`,
    'When the person names a day ("by Friday", "tomorrow", "next week"), work out the date from this yourself and pass it as deadlineDate. Never ask them what today is or how many days away a day is.',
  ].join(' ');
}
