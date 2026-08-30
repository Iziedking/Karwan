import type { DealStage } from '@/features/deals/components/DirectDealList';

export function isOpenDirectDealStage(stage: DealStage): boolean {
  return !['settled', 'cancelled', 'disputed'].includes(stage);
}

export function directDealNeedsViewer(
  stage: DealStage,
  isBuyer: boolean,
): boolean {
  switch (stage) {
    case 'awaiting-acceptance':
    case 'awaiting-delivery':
      return !isBuyer;
    case 'awaiting-funding':
    case 'awaiting-first-release':
    case 'awaiting-final-release':
      return isBuyer;
    default:
      return false;
  }
}
