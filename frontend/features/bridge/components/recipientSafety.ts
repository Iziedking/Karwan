export function isTrustedRecipient(recipient: string, trustedAddresses: readonly (string | null | undefined)[]): boolean {
  const value = recipient.trim().toLowerCase();
  return !!value && trustedAddresses.some((address) => address?.trim().toLowerCase() === value);
}
