'use client';

import { DeskTabs } from '@/features/admin/desk/DeskTabs';
import MatchingReviewPage from '@/features/admin/pages/MatchingReviewPage';
import WordMapPage from '@/features/admin/pages/WordMapPage';

/// Matching: the review of recommendations, and the word map suggestions of view 95.
export default function Page() {
  return <DeskTabs parts={{ review: MatchingReviewPage, 'word-map': WordMapPage }} />;
}
