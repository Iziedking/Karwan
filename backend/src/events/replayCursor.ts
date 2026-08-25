export function sequenceCursor(value: string | undefined): number {
  if (!value) return 0;
  const tail = value.includes(':') ? value.slice(value.lastIndexOf(':') + 1) : value;
  const parsed = Number(tail);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}
