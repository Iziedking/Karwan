/// The API takes a deadline as whole days plus 0 to 23 hours. Round the whole
/// duration up to the hour BEFORE splitting it: rounding only the remainder
/// produces 24 hours for values like 14399 minutes, which the API rejects.
export function splitDeadline(totalSeconds: number): { days: number; hours: number } {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return { days: 0, hours: 0 };
  const totalHours = Math.ceil(totalSeconds / 3600);
  return { days: Math.floor(totalHours / 24), hours: totalHours % 24 };
}
