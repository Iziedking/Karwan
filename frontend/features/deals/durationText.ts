/// A deadline as people read it: in days, with hours or minutes only when the
/// person chose a deadline that short.
export function durationText(
  d: { days: number; hours: number; minutes?: number },
  units: { day: string; days: string; hr: string; min: string },
): string {
  const parts: string[] = [];
  if (d.days > 0) parts.push(d.days === 1 ? units.day : units.days.replace('{n}', String(d.days)));
  if (d.hours > 0) parts.push(`${d.hours} ${units.hr}`);
  if (d.minutes && d.minutes > 0) parts.push(`${d.minutes} ${units.min}`);
  return parts.join(' ') || units.days.replace('{n}', '0');
}
