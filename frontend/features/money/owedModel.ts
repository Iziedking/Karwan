/// Money owed to you on the Money page (view 66): what the row shows and what
/// Collect does with each line.

interface OwedLine {
  id: string;
  amountUsdc: string;
  signs: 'karwan' | 'you';
}

export interface OwedView {
  totalUsdc: number;
  karwanIds: string[];
  walletIds: string[];
  unreadable: boolean;
}

export function owedView(read: { totalUsdc: string; unreadable: boolean; lines: OwedLine[] } | null): OwedView | null {
  if (!read) return null;
  const totalUsdc = Number(read.totalUsdc);
  if (!(totalUsdc > 0) && !read.unreadable) return null;
  return {
    totalUsdc,
    karwanIds: read.lines.filter((l) => l.signs === 'karwan').map((l) => l.id),
    walletIds: read.lines.filter((l) => l.signs === 'you').map((l) => l.id),
    unreadable: read.unreadable,
  };
}

export function owedOutcome(i: { asked: number; collected: number }): 'done' | 'partly' | 'failed' {
  if (i.collected === 0) return 'failed';
  return i.collected < i.asked ? 'partly' : 'done';
}
