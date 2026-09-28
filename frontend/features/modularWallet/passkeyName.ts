const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const MAX_LENGTH = 50;
const SUFFIX_LENGTH = 5;

/// Circle holds a passkey name for a while once options are asked for, and
/// for good once the passkey exists, so a retry, a second device or a
/// recovery under the same name is refused as "duplicated". The email keeps
/// it recognisable in the device's passkey list; the suffix keeps it unique.
/// Circle accepts 5 to 50 characters of letters, digits and _@.:+- only.
export function passkeyName(email: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(SUFFIX_LENGTH));
  const suffix = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
  const base = email.trim().toLowerCase().replace(/[^a-z0-9_@.:+-]/g, '').slice(0, MAX_LENGTH - SUFFIX_LENGTH - 1);
  return `${base}:${suffix}`;
}
