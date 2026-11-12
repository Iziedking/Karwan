const LAGOS = 60 * 60_000;
const MIN = 60_000;
const WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

/// Chosen by the clock in Lagos (UTC+1), where the team works.
export function greeting(now: number): string {
  const hour = new Date(now + LAGOS).getUTCHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function waitLine(n: number): string {
  if (n === 0) return 'Nothing waits for you.';
  const count = WORDS[n] ?? String(n);
  return `${count} ${n === 1 ? 'thing waits' : 'things wait'} for you. Everything else is running.`;
}

export function waited(ms: number): string {
  const minutes = Math.floor(ms / MIN);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

export function firstName(name: string | null): string | null {
  return name?.trim().split(/\s+/)[0] || null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/// "14:31" today and "11 Nov 14:31" before, on the Lagos clock.
export function deskTime(at: number, now: number): string {
  const t = new Date(at + LAGOS);
  const n = new Date(now + LAGOS);
  const hm = `${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}`;
  const sameDay = t.getUTCFullYear() === n.getUTCFullYear() && t.getUTCMonth() === n.getUTCMonth() && t.getUTCDate() === n.getUTCDate();
  return sameDay ? hm : `${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]} ${hm}`;
}
