'use client';

import { PaidDataArticle } from '@/features/developers/components/PaidDataArticle';

/// The paid-data API page at its first address. The same article lives in the
/// developer docs at /developers/paid-data.
export default function X402Page() {
  return (
    <div className="bg-[var(--lp-light)] text-[var(--lp-dark)] -mt-10">
      <div className="mx-auto max-w-[1440px] px-[clamp(20px,5vw,72px)] py-[clamp(36px,5vw,64px)]">
        <main className="min-w-0 max-w-[860px]">
          <PaidDataArticle />
        </main>
      </div>
    </div>
  );
}
