'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/shared/utils/cn';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

interface Heading {
  id: string;
  text: string;
}

/// "On this page": the page's linked sections, with the one you are reading
/// marked. Built from the page's h2 headings; any heading without an id gets one.
export function DocsToc() {
  const pathname = usePathname();
  const title = useTranslations().docsProduct.toc.title;
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-docs-content] article h2'));
    const used = new Set<string>();
    nodes.forEach((n, i) => {
      if (!n.id) {
        const base = (n.textContent ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `section-${i + 1}`;
        let id = base;
        for (let k = 2; used.has(id) || document.getElementById(id); k++) id = `${base}-${k}`;
        n.id = id;
        n.style.scrollMarginTop = '104px';
      }
      used.add(n.id);
    });
    setHeadings(nodes.map((n) => ({ id: n.id, text: n.textContent?.trim() ?? '' })));
    if (nodes.length === 0) return;
    const seen = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting);
        const first = nodes.find((n) => seen.get(n.id));
        if (first) setActive(first.id);
      },
      { rootMargin: '-96px 0px -60% 0px' },
    );
    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, [pathname]);

  if (headings.length < 2) return null;
  return (
    <nav aria-label={title} className="hidden 2xl:block 2xl:sticky 2xl:top-[104px] 2xl:self-start">
      <p className="text-[13px] font-semibold text-[var(--lp-dark)]">{title}</p>
      <ul className="mt-3 border-s border-[var(--lp-border-light)]">
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              aria-current={active === h.id ? 'location' : undefined}
              className={cn(
                '-ms-px block border-s-2 py-1.5 ps-4 text-[13px] leading-snug transition-colors',
                active === h.id
                  ? 'border-[var(--lp-dark)] font-semibold text-[var(--lp-dark)]'
                  : 'border-transparent text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)]',
              )}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
