/// Documentation shell. Two columns on desktop (sticky sidebar nav + content),
/// stacked on mobile. Inherits the cream landing palette so the docs read as
/// part of the product rather than an external knowledge base. Children are
/// server-rendered TSX pages that drop their own bands and prose inside.
import type { ReactNode } from 'react';
import { DocsSidebar } from '@/features/docs/components/DocsSidebar';
import { DocsPager } from '@/features/docs/components/DocsPager';
import { DocsToc } from '@/features/docs/components/DocsToc';
import { ReadingProgress } from '@/features/docs/components/ReadingProgress';

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="ms-[calc(50%-50vw)] w-screen bg-[var(--lp-light)] text-[var(--lp-dark)]">
      <ReadingProgress />
      <div className="mx-auto max-w-[1360px] px-[clamp(20px,5vw,72px)] py-[clamp(36px,5vw,64px)]">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-14 2xl:grid-cols-[240px_minmax(0,1fr)_200px]">
          <DocsSidebar />
          <div className="min-w-0" data-docs-content>
            {children}
            {/* Prev/next pager so readers (esp. mobile) move on without scrolling
                back up to the sidebar. */}
            <DocsPager />
          </div>
          <DocsToc />
        </div>
      </div>
    </div>
  );
}
