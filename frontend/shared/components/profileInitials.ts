/// Two letters for the profile button when there is no photo: the first
/// letters of two words, else the first two of one, else the address.
export function getProfileInitials(name: string, address: string | null): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  const compact = name.replace(/[^\p{L}\p{N}]/gu, '');
  if (compact.length >= 2) return compact.slice(0, 2).toUpperCase();
  if (address) return address.replace(/^0x/i, '').slice(0, 2).toUpperCase();
  return 'KW';
}
