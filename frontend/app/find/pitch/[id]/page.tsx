'use client';

import { use } from 'react';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { PitchPage } from '@/features/find/PitchPage';

/// A seller's offer for one of the person's regular needs (view 72). Only theirs.
export default function PitchRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <AuthGuard>
      <PitchPage id={decodeURIComponent(id)} />
    </AuthGuard>
  );
}
