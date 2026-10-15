/// A wallet balance to the cent with grouped thousands, or null when it could
/// not be read, so the page says "unavailable" in the reader's language rather
/// than show a guess.
export function walletAmount(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (value.trim() === '' || !Number.isFinite(n)) return null;
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
