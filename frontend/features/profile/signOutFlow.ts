import { SIGNED_OUT_ROUTE } from '../../shared/auth/signedOutRoute';

/** Shared by the Profile control and isolated tests, without ending a real session. */
export async function confirmSignOut(actions: {
  confirm: () => Promise<boolean>;
  signOut: () => Promise<void>;
  leave: (destination: string) => void;
}): Promise<void> {
  if (!await actions.confirm()) return;
  await actions.signOut();
  actions.leave(SIGNED_OUT_ROUTE);
}
