'use client';

import { use } from 'react';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { FindPage } from '@/features/find/FindPage';

/// The people a person's agent found for them (view 72). Private to them.
export default function FindRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <AuthGuard>
      <FindPage id={decodeURIComponent(id)} />
    </AuthGuard>
  );
}
