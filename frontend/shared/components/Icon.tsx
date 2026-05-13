import type { SVGProps } from 'react';

const base: SVGProps<SVGSVGElement> = {
  width: 14,
  height: 14,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

export function GlobeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="8" cy="8" r="6" />
      <path d="M2 8h12M8 2c2.5 2 2.5 10 0 12M8 2c-2.5 2-2.5 10 0 12" />
    </svg>
  );
}

export function CoinIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="8" cy="8" r="6" />
      <path d="M6 6.5c0-.8 1-1.5 2-1.5s2 .7 2 1.5-1 1.5-2 1.5-2 .7-2 1.5 1 1.5 2 1.5 2-.7 2-1.5M8 4v8" />
    </svg>
  );
}

export function BuyerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="8" cy="6" r="2.5" />
      <path d="M3 14c0-2.5 2.2-4.5 5-4.5s5 2 5 4.5" />
    </svg>
  );
}

export function SellerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="6" width="10" height="8" rx="1" />
      <path d="M6 6V4.5C6 3.7 6.7 3 7.5 3h1c.8 0 1.5.7 1.5 1.5V6" />
    </svg>
  );
}

export function WalletIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="2.5" y="4.5" width="11" height="8" rx="1.2" />
      <path d="M2.5 7h11M11 9.5h.5" />
    </svg>
  );
}

export function FlowIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="3.5" cy="8" r="1.5" />
      <circle cx="12.5" cy="8" r="1.5" />
      <path d="M5 8h6" />
      <path d="M9 6l2 2-2 2" />
    </svg>
  );
}

export function PulseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M1.5 8h3l1.5-4 3 8 1.5-4h4" />
    </svg>
  );
}

export function ListIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M5 4h8M5 8h8M5 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01" />
    </svg>
  );
}

export function ContractIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M4 2h6l3 3v9a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" />
      <path d="M10 2v3h3M6 8h4M6 11h4" />
    </svg>
  );
}

export function ChainIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M6.5 9.5l-2 2a2.5 2.5 0 01-3.5-3.5l2-2a2.5 2.5 0 013.5 0M9.5 6.5l2-2a2.5 2.5 0 013.5 3.5l-2 2a2.5 2.5 0 01-3.5 0M6 10l4-4" />
    </svg>
  );
}
