import type { ReactNode } from 'react';
import { DevelopersSidebar } from '@/features/developers/components/DevelopersSidebar';
import { DevelopersPager } from '@/features/developers/components/DevelopersPager';

/// Developer docs: a sticky sidebar with search and grouped pages beside the
/// page itself, stacked behind a Menu button on phones. Every developer
/// feature Karwan adds gets a page here (features/developers/sections.ts).
export default function DevelopersLayout({ children }: { children: ReactNode }) {
  return (
    <div className="ms-[calc(50%-50vw)] -mt-10 w-screen bg-[var(--lp-light)] text-[var(--lp-dark)]">
      <div className="mx-auto max-w-[1280px] px-[clamp(16px,5vw,72px)] py-[clamp(24px,4vw,56px)]">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[272px_minmax(0,1fr)] lg:gap-12">
          <DevelopersSidebar />
          <main className="min-w-0 max-w-[820px]">
            <article>{children}</article>
            <DevelopersPager />
          </main>
        </div>
      </div>
    </div>
  );
}
