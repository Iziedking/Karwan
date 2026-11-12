import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface Crumb {
  label: string;
  href?: string;
}

export function DeskPage({ crumbs, title, badge, meta, subtitle, actions, children }: {
  crumbs?: Crumb[];
  title: ReactNode;
  badge?: ReactNode;
  meta?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[1136px]">
      <header className="pb-4">
        {crumbs && crumbs.length > 0 && (
          <nav aria-label="Where you are" className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[12px] font-medium">
            {crumbs.map((c, i) => (
              <span key={`${c.label}-${i}`} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-[var(--d-text-3)]">/</span>}
                {c.href ? <Link href={c.href} className="text-[var(--d-blue)] hover:underline">{c.label}</Link> : <span className="text-[var(--d-text-2)]">{c.label}</span>}
              </span>
            ))}
          </nav>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-[24px] font-semibold leading-[30px] tracking-[-0.01em]">{title}</h1>
          {badge}
          {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {meta && <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-[var(--d-text-2)]">{meta}</div>}
        {subtitle && <p className="mt-1.5 text-[13px] text-[var(--d-text-2)]">{subtitle}</p>}
      </header>
      <div className="space-y-5">{children}</div>
    </div>
  );
}

export function DeskButton({ tone = 'secondary', icon, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: 'primary' | 'secondary';
  icon?: ReactNode;
}) {
  const look = tone === 'primary'
    ? 'bg-[var(--d-lime)] text-[#0D0E10] hover:brightness-105'
    : 'border border-[var(--d-line)] bg-[var(--d-button)] text-[var(--d-text)] hover:border-[var(--d-line-2)]';
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex h-[30px] items-center justify-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${look} ${className ?? ''}`}
    >
      {icon}
      {children}
    </button>
  );
}

/// A link that looks like a desk button.
export function DeskLink({ href, tone = 'secondary', children }: { href: string; tone?: 'primary' | 'secondary'; children: ReactNode }) {
  const look = tone === 'primary'
    ? 'bg-[var(--d-lime)] text-[#0D0E10] hover:brightness-105'
    : 'border border-[var(--d-line)] bg-[var(--d-button)] text-[var(--d-text)] hover:border-[var(--d-line-2)]';
  return (
    <Link href={href} className={`inline-flex h-[30px] items-center justify-center whitespace-nowrap rounded-md px-2.5 text-[13px] font-medium transition ${look}`}>
      {children}
    </Link>
  );
}
