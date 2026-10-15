/// Whether this browser was signed in last time the app checked. It only picks
/// where "Open Karwan" points, so the landing never has to run sign-in and a
/// signed-in person never passes through the sign-in screen. Not proof of a
/// session: the app still checks, and sends anyone signed out to sign in.
const KEY = 'karwan.signedIn';

type HintStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function browserStorage(): HintStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function rememberSignedIn(signedIn: boolean, storage: HintStorage | null = browserStorage()): void {
  try {
    if (signedIn) storage?.setItem(KEY, '1');
    else storage?.removeItem(KEY);
  } catch {
    /* blocked storage: the landing falls back to the sign-in page */
  }
}

export function wasSignedIn(storage: HintStorage | null = browserStorage()): boolean {
  try {
    return storage?.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function entryHref(signedIn: boolean, home: string): string {
  return signedIn ? home : '/start';
}
