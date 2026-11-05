import { NETWORK_LOGOS } from '../networkLogos';

/// A network's own round logo, or its initial when there is none (view 51).
export function NetworkLogo({ chain, name, size = 40 }: { chain: string; name: string; size?: number }) {
  const svg = NETWORK_LOGOS[chain];
  if (!svg) {
    return (
      <span aria-hidden style={{ width: size, height: size }} className="grid shrink-0 place-items-center rounded-full bg-[var(--raised)] text-[15px] font-semibold text-[var(--ink)]">
        {name.slice(0, 1)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static inline logo, nothing to optimise
    <img
      alt=""
      aria-hidden
      width={size}
      height={size}
      src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
      className="shrink-0 rounded-full"
    />
  );
}
