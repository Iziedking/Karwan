/// A question typed somewhere else, such as the box on Home, carried into
/// assistant mode and sent there as a new conversation. Per tab, taken once;
/// kept out of the address so what was typed never lands in a URL.

export const ASK_KEY = 'karwan:assistant-ask';

export function carryAsk(text: string): void {
  const clean = text.trim();
  if (!clean) return;
  try {
    sessionStorage.setItem(ASK_KEY, clean);
  } catch {
    /* blocked storage: assistant mode opens without it */
  }
}

export function takeAsk(): string | null {
  try {
    const text = sessionStorage.getItem(ASK_KEY);
    sessionStorage.removeItem(ASK_KEY);
    return text?.trim() || null;
  } catch {
    return null;
  }
}
