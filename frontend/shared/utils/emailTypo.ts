/// Catches the email typos that stop a sign-in code from ever arriving, such
/// as "gmail.cm" or "gmial.com", and offers the likely address. Only well-known
/// mail providers are corrected, so a real domain like "company.cm" is never
/// second-guessed; ".con" is fixed everywhere because it is not a real ending.

const PROVIDERS = [
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'icloud.com',
  'aol.com',
  'ymail.com',
  'protonmail.com',
];

/// Real providers that sit a letter or two from one above ("mail.com" is one
/// edit from "gmail.com"). Never corrected.
const ALSO_REAL = new Set([
  'mail.com', 'email.com', 'gmx.com', 'gmx.de', 'gmx.net', 'proton.me', 'pm.me', 'me.com', 'mac.com', 'msn.com',
  'yandex.com', 'yandex.ru', 'zoho.com', 'qq.com', 'aim.com', 'live.co.uk', 'hotmail.co.uk', 'hotmail.fr', 'yahoo.fr',
  'outlook.fr', 'fastmail.com', 'tutanota.com', 'hey.com',
]);

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const next = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = next;
    }
  }
  return row[b.length]!;
}

export function suggestEmail(raw: string): string | null {
  const email = raw.trim();
  const at = email.lastIndexOf('@');
  if (at < 1 || at === email.length - 1) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1).toLowerCase();
  if (!domain.includes('.')) return null;
  if (PROVIDERS.includes(domain) || ALSO_REAL.has(domain)) return null;

  let best: string | null = null;
  let bestDistance = Infinity;
  for (const provider of PROVIDERS) {
    const d = distance(domain, provider);
    if (d < bestDistance) {
      best = provider;
      bestDistance = d;
    }
  }
  // Two edits covers a swapped pair ("gmial") and a missing letter plus a
  // wrong ending, without pulling unrelated domains onto a provider.
  if (best && bestDistance <= 2 && domain.split('.')[0]!.length >= 3) {
    const name = domain.split('.')[0]!;
    const bestName = best.split('.')[0]!;
    // Keep real regional addresses such as yahoo.co.uk or yahoo.fr.
    if (name === bestName && domain.split('.').length > 2) return null;
    if (name === bestName && !/^(cm|co|con|cmo|om|comm|vom|xom|c)$/.test(domain.slice(name.length + 1))) return null;
    return `${local}@${best}`;
  }
  if (domain.endsWith('.con')) return `${local}@${domain.slice(0, -4)}.com`;
  return null;
}
