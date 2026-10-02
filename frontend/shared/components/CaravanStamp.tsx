/// Kaba, the caravan camel, inside a dotted seal: Karwan's sign-off on a
/// receipt. The box on its back is the money it carried until delivery.
export const CAMEL_PATH =
  'M26 66c-3-11 3-19 11-22 3-17 25-24 35-7 6 2 10 6 13 11l6-17c2-6 9-9 15-6l5 3c2 2 1 5-2 5h-5l-6 25c-2 9-8 13-16 13H32c-4 0-6-2-6-5z';

export function CaravanStamp({ size = 56, tone = 'ink' }: { size?: number; tone?: 'ink' | 'lime' }) {
  const ink = tone === 'ink' ? '#16202A' : '#AFC95B';
  const box = tone === 'ink' ? '#AFC95B' : '#121A21';
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 120 120" className="shrink-0">
      <circle cx="60" cy="60" r="56" fill="none" stroke={ink} strokeWidth="3" strokeDasharray="3 6" />
      <g transform="translate(5 14) scale(0.9)">
        <g fill={ink}>
          <path d={CAMEL_PATH} />
          <rect x="31" y="64" width="7" height="26" rx="3" />
          <rect x="42" y="64" width="7" height="26" rx="3" />
          <rect x="71" y="64" width="7" height="26" rx="3" />
          <rect x="82" y="64" width="7" height="26" rx="3" />
        </g>
        <path d="M27 55c-7 3-9 9-7 16" stroke={ink} strokeWidth="4" fill="none" strokeLinecap="round" />
        <rect x="45" y="14" width="22" height="15" rx="3" fill={box} />
      </g>
    </svg>
  );
}
