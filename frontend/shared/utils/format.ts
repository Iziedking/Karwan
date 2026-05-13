export function shortHash(h: string, head = 6, tail = 4): string {
  if (!h) return '—';
  if (h.length <= head + tail + 1) return h;
  return `${h.slice(0, head)}…${h.slice(-tail)}`;
}

export function shortAddress(h?: string | null): string {
  if (!h) return '—';
  return `${h.slice(0, 6)}…${h.slice(-4)}`;
}

export function formatUsdc(value: string | number, opts?: { withSuffix?: boolean }): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(n)) return '—';
  const fixed = n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return opts?.withSuffix === false ? fixed : `${fixed} USDC`;
}

export function relativeTime(unixMsOrSec: number): string {
  const ms = unixMsOrSec > 10_000_000_000 ? unixMsOrSec : unixMsOrSec * 1000;
  const diff = ms - Date.now();
  const abs = Math.abs(diff);
  const sign = diff < 0 ? -1 : 1;
  const units: Array<[number, string]> = [
    [60_000, 'min'],
    [3_600_000, 'hr'],
    [86_400_000, 'd'],
    [2_592_000_000, 'mo'],
  ];
  if (abs < 60_000) return sign < 0 ? 'just now' : 'in moments';
  for (let i = units.length - 1; i >= 0; i--) {
    const [u, label] = units[i]!;
    if (abs >= u) {
      const value = Math.round(abs / u);
      return sign < 0 ? `${value} ${label} ago` : `in ${value} ${label}`;
    }
  }
  return '';
}

export function explorerTxUrl(explorerBase: string, txHash: string): string {
  return `${explorerBase}/tx/${txHash}`;
}
