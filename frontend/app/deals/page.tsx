'use client';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { FullBleed, Band } from '@/shared/components/Bands';
import { DealsPage } from '@/features/deals/DealsPage';

export default function Page() {
  return (
    <AuthGuard>
      <div className="product-surface">
        <FullBleed>
          <Band tone="light" compact>
            <div className="fade-up fade-up-1">
              <DealsPage />
            </div>
          </Band>
        </FullBleed>
      </div>
    </AuthGuard>
  );
}
