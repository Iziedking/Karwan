/// Documentation shell. Two columns on desktop (sticky sidebar nav + content),
/// stacked on mobile. Inherits the cream landing palette so the docs read as
/// part of the product rather than an external knowledge base. Children are
/// server-rendered TSX pages that drop their own bands and prose inside.
import type { ReactNode } from 'react';
import { DocsSidebar } from '@/features/docs/components/DocsSidebar';

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-[var(--lp-light)] text-[var(--lp-dark)] -mt-10">
      <div className="mx-auto max-w-[1440px] px-[clamp(20px,5vw,72px)] py-[clamp(36px,5vw,64px)]">
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-10 lg:gap-16">
          <DocsSidebar />
          <main className="min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
