const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/// Circle holds a passkey name for a while once options are asked for, and
/// for good once the passkey exists, so a retry, a second device or a
/// recovery under the same name is refused as "duplicated". The email keeps
/// it recognisable in the device's passkey list; the suffix keeps it unique.
export function passkeyName(email: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  const suffix = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
  return `${email.trim().toLowerCase()} (${suffix})`;
}
