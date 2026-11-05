/// One key on the amount keypad: a digit, the decimal point, or back.
export type AmountKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | 'back';

const MAX_DECIMALS = 6;
const MAX_WHOLE = 9;

/// What the amount reads after one key. USDC has six decimals and a figure
/// longer than nine whole digits would not fit the screen, so keys past either
/// limit do nothing; a lone 0 gives way to the next digit.
export function pressKey(typed: string, key: AmountKey): string {
  if (key === 'back') return typed.slice(0, -1);
  const dot = typed.indexOf('.');
  if (key === '.') {
    if (dot >= 0) return typed;
    return typed === '' ? '0.' : `${typed}.`;
  }
  if (dot >= 0) return typed.length - dot - 1 >= MAX_DECIMALS ? typed : typed + key;
  if (typed === '0') return key;
  return typed.length >= MAX_WHOLE ? typed : typed + key;
}

export function pressKeys(typed: string, keys: AmountKey[]): string {
  return keys.reduce(pressKey, typed);
}
