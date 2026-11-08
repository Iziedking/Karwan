'use client';
import { useSyncExternalStore } from 'react';
import { getShellSurface } from '@/shared/utils/routes';
import { wasSignedIn } from './signedInHint';

/// Which frame to draw while the sign-in check is still on its way (8 Nov
/// 2026). The check takes one to four seconds on a slow line, and drawing the
/// signed-out frame until it answers made every page open in the public look
/// and then jump into the app. This only picks the frame: data, actions and
/// the sign-in gate still wait for the real answer.
///
///   - Once the check answered, it decides.
///   - In the browser, the note of whether this browser was signed in last
///     time decides (signedInHint).
///   - On the server there is no note: a page only signed-in people use draws
///     the app frame; a page shared with visitors draws the public one.
export function shellSignedIn(input: {
  authenticated: boolean;
  loading: boolean;
  /// null on the server, where the browser note cannot be read.
  hint: boolean | null;
  pathname: string | null | undefined;
}): boolean {
  if (input.authenticated) return true;
  if (!input.loading) return false;
  if (input.hint !== null) return input.hint;
  return getShellSurface(input.pathname, false) === 'workspace';
}

const subscribeNever = () => () => {};
const readHint = () => wasSignedIn();
const serverHint = () => null;

export function useShellSignedIn(pathname: string | null | undefined, auth: { isAuthenticated: boolean; isLoading: boolean }): boolean {
  const hint = useSyncExternalStore<boolean | null>(subscribeNever, readHint, serverHint);
  return shellSignedIn({ authenticated: auth.isAuthenticated, loading: auth.isLoading, hint, pathname });
}
