/// A seller lowering their own offer (view 35): the price is checked before it
/// leaves the page, and the server's refusals read as their own words.

export function lowerCheck(input: string, standingUsdc: string): 'ok' | 'NOT_LOWER' {
  const value = input.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(value) || !(Number(value) > 0)) return 'NOT_LOWER';
  return Number(value) < Number(standingUsdc) ? 'ok' : 'NOT_LOWER';
}

export function lowerErrorKey(code: string): 'NOT_LOWER' | 'LIMIT' | 'CLOSED' | 'BUSY' | 'other' {
  return code === 'NOT_LOWER' || code === 'LIMIT' || code === 'CLOSED' || code === 'BUSY' ? code : 'other';
}
