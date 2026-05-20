'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/shared/utils/cn';

interface DocsSection {
  label: string;
  href: string;
  blurb: string;
}

const SECTIONS: DocsSection[] = [
  { label: 'Overview', href: '/docs', blurb: 'What Karwan is and how the pieces fit.' },
  { label: 'Agents', href: '/docs/agents', blurb: 'How the buyer and seller agents negotiate.' },
  { label: 'Deals & Escrow', href: '/docs/deals', blurb: 'Both deal flows, milestones, settlement.' },
  { label: 'Reputation & Stake', href: '/docs/reputation', blurb: 'The composite score and the vault.' },
  { label: 'Bridge', href: '/docs/bridge', blurb: 'Cross-chain USDC with CCTP V2.' },
  { label: 'Roadmap', href: '/docs/roadmap', blurb: 'Strong functionality shipping next.' },
  { label: 'FAQs', href: '/docs/faq', blurb: 'Quick answers for first-time users.' },
];

export function DocsSidebar() {
  const pathname = usePathname();
  return (
    <aside className="lg:sticky lg:top-[88px] lg:self-start">
      <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)] mb-4">
        [:DOCUMENTATION:]
      </p>
      <nav className="flex flex-col gap-1">
        {SECTIONS.map((section) => {
          const active =
            section.href === '/docs'
              ? pathname === '/docs'
              : pathname?.startsWith(section.href) === true;
          return (
            <Link
              key={section.href}
              href={section.href}
              className={cn(
                'group flex items-baseline gap-2 py-2 px-3 text-[14px] font-medium tracking-[-0.005em] transition-colors',
                active
                  ? 'bg-[var(--lp-card)] text-[var(--lp-dark)]'
                  : 'text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] hover:bg-[var(--lp-card)]/60',
              )}
              style={{
                borderTopLeftRadius: 10,
                borderTopRightRadius: 10,
                borderBottomLeftRadius: 10,
                borderBottomRightRadius: 3,
              }}
            >
              <span
                aria-hidden
                className={cn(
                  'inline-block w-1.5 h-1.5 rounded-full transition-colors',
                  active ? 'bg-[var(--lp-accent)]' : 'bg-[var(--lp-border-light)] group-hover:bg-[var(--lp-accent)]',
                )}
              />
              {section.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
