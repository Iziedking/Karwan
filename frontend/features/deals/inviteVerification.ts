export class InviteRecipientMismatchError extends Error {
  constructor() {
    super('verified identity does not own this invite');
    this.name = 'InviteRecipientMismatchError';
  }
}

export async function verifyInviteRecipient<T extends { viewer: { canClaim: boolean } }>(input: {
  email: string;
  code: string;
  token: string;
  verifyOtp: (email: string, code: string) => Promise<unknown>;
  refreshAuth: () => Promise<unknown>;
  loadInvite: (token: string) => Promise<T>;
}): Promise<T> {
  await input.verifyOtp(input.email, input.code);
  await input.refreshAuth();
  const invite = await input.loadInvite(input.token);
  if (!invite.viewer.canClaim) throw new InviteRecipientMismatchError();
  return invite;
}
