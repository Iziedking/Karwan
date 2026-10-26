/// Whether this key press sends the message. On a computer Enter sends and
/// Shift+Enter adds a line. On a phone the keyboard's Enter adds a line and the
/// send button sends, as in messaging apps. A word still being composed (an
/// input method's Enter) never sends.
export function enterSends(e: { key: string; shiftKey: boolean; isComposing?: boolean }, touch: boolean): boolean {
  if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return false;
  return !touch;
}

/// A phone or tablet: the main pointer is a finger.
export function touchKeyboard(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
}
