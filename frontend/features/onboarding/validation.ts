/** Matches the profile API: one to five whole, positive percentages totalling 100.
 * Invalid tokens must not silently disappear before submission. */
export function parseMilestoneSplit(input: string): number[] | null {
  const tokens = input.split(',').map((token) => token.trim());
  if (tokens.length < 1 || tokens.length > 5 || tokens.some((token) => !/^\d{1,3}$/.test(token))) return null;
  const values = tokens.map(Number);
  if (values.some((value) => value < 1 || value > 100)) return null;
  return values.reduce((sum, value) => sum + value, 0) === 100 ? values : null;
}
