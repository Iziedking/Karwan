/// A figure a business typed into a free-text field. A bare number is
/// regrouped so "5,0000" reads as 50,000; anything with words ("500 units",
/// "5,000 USD") is shown exactly as written. No unit is ever added: the form
/// does not ask for one, so the page cannot know it.
export function listedAmount(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  const bare = value.replace(/[,\s]/g, '');
  if (!/^\d+(\.\d+)?$/.test(bare)) return value;
  const [whole, fraction] = bare.split('.');
  const grouped = Number(whole).toLocaleString('en-US');
  return fraction ? `${grouped}.${fraction}` : grouped;
}
